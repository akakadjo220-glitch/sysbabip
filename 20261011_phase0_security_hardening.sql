-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 0 — Durcissement sécurité (audit du 2026-10-11)
-- ═══════════════════════════════════════════════════════════════════════════
-- À exécuter dans l'éditeur SQL Supabase (rôle postgres), APRÈS avoir déployé
-- le nouveau serveur (server/index.js) avec SUPABASE_SERVICE_ROLE_KEY : le
-- serveur n'utilise plus la clé anon et dépend de ces règles.
--
-- Le script est idempotent et ne dépend pas des noms exacts des policies
-- existantes : il les détecte dans pg_policies. Chaque policy supprimée est
-- listée via RAISE NOTICE.
--
-- Ce que ce script NE corrige PAS encore (Phase 1, achat côté serveur) :
--   * INSERT anon sur tickets / transactions (le checkout client en dépend)
--   * increment_event_sold / increment_ticket_type_sold / increment_ambassador_stats
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Helper : l'appelant est-il admin ? ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND upper(role::text) = 'ADMIN'
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Appel « de confiance » : admin connecté, service_role, ou code exécuté par
-- le propriétaire (fonctions SECURITY DEFINER, triggers d'auth, migrations).
CREATE OR REPLACE FUNCTION public.is_privileged_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
      OR coalesce(auth.role(), '') = 'service_role'
      OR public.is_admin();
$$;
REVOKE ALL ON FUNCTION public.is_privileged_caller() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_privileged_caller() TO anon, authenticated, service_role;

-- ─── 2. Tables entièrement réservées au serveur / à l'admin ────────────────
-- platform_settings contient les clés de paiement, SMTP, WhatsApp, Chevereto.
-- auth_otps, email_queue, whatsapp_queue ne doivent jamais être lisibles côté client.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('platform_settings', 'auth_otps', 'email_queue', 'whatsapp_queue')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Policy supprimée : %.%', r.tablename, r.policyname;
  END LOOP;
END $$;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase0_admin_all ON public.platform_settings
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;          -- aucune policy = aucun accès client
REVOKE ALL ON public.auth_otps FROM anon, authenticated;
ALTER TABLE public.auth_otps ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.auth_otps ADD COLUMN IF NOT EXISTS purpose text;
-- Les anciens codes (en clair, lisibles de tous) sont invalidés.
DELETE FROM public.auth_otps;

DO $$
BEGIN
  IF to_regclass('public.email_queue') IS NOT NULL THEN
    ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.email_queue FROM anon, authenticated;
    -- Plus d'identifiants SMTP stockés par ligne : le worker lit platform_settings.
    ALTER TABLE public.email_queue ALTER COLUMN smtp_config DROP NOT NULL;
    UPDATE public.email_queue SET smtp_config = NULL WHERE smtp_config IS NOT NULL;
  END IF;
  IF to_regclass('public.whatsapp_queue') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.whatsapp_queue FROM anon, authenticated;
  END IF;
END $$;

-- Lecture publique contrôlée des réglages : seules des clés non sensibles,
-- et pour les configs de paiement seulement les champs publics.
CREATE OR REPLACE FUNCTION public.get_platform_settings(p_keys text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  r record;
  public_keys constant text[] := ARRAY[
    'payment_toggles', 'email_templates',
    'default_commission_rate', 'default_advance_rate',
    'default_fundraising_commission_rate', 'default_physical_commission_rate',
    'max_physical_tickets_per_batch'
  ];
BEGIN
  IF public.is_admin() THEN
    SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_result
    FROM public.platform_settings WHERE key = ANY(p_keys);
    RETURN v_result;
  END IF;

  FOR r IN SELECT key, value FROM public.platform_settings WHERE key = ANY(p_keys) LOOP
    IF r.key = ANY(public_keys) THEN
      v_result := v_result || jsonb_build_object(r.key, r.value);
    ELSIF r.key = 'paystack_config' THEN
      v_result := v_result || jsonb_build_object(r.key, jsonb_build_object('publicKey', r.value->'publicKey'));
    ELSIF r.key = 'chevereto_config' THEN
      v_result := v_result || jsonb_build_object(r.key, jsonb_build_object('enabled', coalesce(r.value->'enabled', 'false'::jsonb)));
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_platform_settings(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_settings(text[]) TO anon, authenticated, service_role;

-- ─── 3. Policies « tout le monde peut tout faire » sur les tables clés ─────
-- On supprime les policies ALL/UPDATE/DELETE/INSERT dont la condition est
-- littéralement « true » (ex. admin_setup_fix.sql), puis on recrée un accès
-- admin propre. Les INSERT anon sur transactions restent (Phase 1).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('events', 'profiles', 'transactions', 'ad_banners')
      AND (
        (cmd IN ('ALL', 'UPDATE', 'DELETE') AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true'))
        OR (cmd = 'INSERT' AND coalesce(with_check, '') = 'true' AND tablename <> 'transactions')
      )
      AND roles <> '{service_role}'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Policy permissive supprimée : %.% (%)', r.tablename, r.policyname, r.cmd;
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'profiles', 'transactions', 'ad_banners'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS phase0_admin_all ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY phase0_admin_all ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()))',
        t);
    END IF;
  END LOOP;
END $$;

-- ─── 4. profiles : interdire l'auto-promotion ──────────────────────────────
-- Un utilisateur peut modifier son nom, téléphone, avatar, société, et
-- soumettre des documents (statut « pending »), mais jamais se donner un rôle
-- privilégié, s'activer, ni se marquer vérifié.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  self_roles constant text[] := ARRAY['USER', 'GUEST', 'ORGANIZER', 'AMBASSADOR'];
  col text;
BEGIN
  IF public.is_privileged_caller() THEN
    RETURN NEW;
  END IF;

  -- Rôle : seulement USER/GUEST → ORGANIZER/AMBASSADOR (inscription), jamais ADMIN/AGENT.
  IF (n->>'role') IS DISTINCT FROM (o->>'role') THEN
    IF upper(coalesce(n->>'role', 'USER')) <> ALL(self_roles)
       OR (TG_OP = 'UPDATE' AND upper(coalesce(o->>'role', 'USER')) NOT IN ('USER', 'GUEST')) THEN
      RAISE EXCEPTION 'Modification du rôle non autorisée' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Statut de compte : l'utilisateur ne peut que (re)passer en « pending ».
  IF (n->>'status') IS DISTINCT FROM (o->>'status') AND coalesce(n->>'status', 'pending') <> 'pending' THEN
    RAISE EXCEPTION 'Modification du statut non autorisée' USING ERRCODE = '42501';
  END IF;

  -- Statuts de vérification : seulement « pending » ou « not_started ».
  FOREACH col IN ARRAY ARRAY['didit_status', 'address_status', 'business_status'] LOOP
    IF (n->>col) IS DISTINCT FROM (o->>col)
       AND coalesce(n->>col, 'pending') NOT IN ('pending', 'not_started') THEN
      RAISE EXCEPTION 'Modification de % non autorisée', col USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Colonnes réservées à l'admin / au serveur.
  FOREACH col IN ARRAY ARRAY['is_verified', 'verified_at', 'free_physical_tickets_granted',
                             'address_rejection_reason', 'business_rejection_reason', 'didit_session_id'] LOOP
    IF (n->>col) IS DISTINCT FROM (o->>col)
       AND NOT (col LIKE '%rejection_reason' AND n->>col IS NULL) THEN
      RAISE EXCEPTION 'Modification de % non autorisée', col USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Compteur de billets physiques gratuits : ne peut qu'augmenter.
  IF TG_OP = 'UPDATE'
     AND coalesce((n->>'free_physical_tickets_used')::numeric, 0) < coalesce((o->>'free_physical_tickets_used')::numeric, 0) THEN
    RAISE EXCEPTION 'Modification de free_physical_tickets_used non autorisée' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ─── 5. RPC sensibles : retirer l'exécution anonyme ────────────────────────
-- Par défaut PostgreSQL accorde EXECUTE à PUBLIC. Ces fonctions ne sont plus
-- appelées que par le serveur (service_role).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('save_whatsapp_otp', 'verify_whatsapp_otp', 'find_tickets_by_contact',
                        'get_auth_users_info', 'verify_organizer', 'verify_agent_pin')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
    RAISE NOTICE 'EXECUTE retiré au public : %', r.fn;
  END LOOP;

  -- hash_pin reste utilisable par les organisateurs connectés (création d'agents).
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hash_pin'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.fn);
  END LOOP;
END $$;

-- ─── 6. search_path figé sur toutes les fonctions SECURITY DEFINER ─────────
-- Empêche le détournement d'une fonction privilégiée via un objet homonyme.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.fn);
    RAISE NOTICE 'search_path fixé : %', r.fn;
  END LOOP;
END $$;

COMMIT;

-- ─── Vérifications à lancer après exécution ───────────────────────────────
-- 1. Plus aucune policy « true » en écriture sur les tables clés :
--   SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
--   WHERE schemaname='public' AND tablename IN ('events','profiles','transactions','platform_settings','auth_otps','ad_banners');
-- 2. Avec la clé anon, ceci doit renvoyer [] :
--   GET /rest/v1/platform_settings?select=key
--   GET /rest/v1/auth_otps?select=email
-- 3. Ceci ne doit contenir que des réglages publics :
--   POST /rest/v1/rpc/get_platform_settings {"p_keys":["paystack_config","smtp_config","payment_toggles"]}
