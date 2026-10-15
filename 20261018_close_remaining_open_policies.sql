-- ═══════════════════════════════════════════════════════════════════════════
-- COMPLÉMENT SÉCURITÉ — policies encore ouvertes relevées en base (15/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- À exécuter juste APRÈS 20261017_phase5_archive.sql (même fenêtre de maintenance).
--
-- Relevé fait sur la base réelle : ces policies laissaient encore n'importe qui
--   * lire TOUTES les transactions (e-mails, téléphones, montants)   → transactions
--   * lire les agents, PIN compris                                     → agents
--   * lire les coordonnées de versement des organisateurs              → payout_settings
--   * modifier n'importe quel avis                                     → reviews
--   * modifier les compteurs d'affiliation                             → affiliate_links
--
-- Ces tables ne sont lues que par l'admin, l'organisateur concerné ou le
-- serveur : leurs accès sont recréés explicitement ci-dessous. Les visiteurs
-- gardent la lecture des avis et le dépôt d'un avis (page événement).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Suppression des policies ouvertes ─────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true')
      AND (
        -- lecture publique de données personnelles / secrets
        (tablename IN ('transactions', 'agents', 'payout_settings'))
        -- écriture publique
        OR (tablename IN ('reviews', 'affiliate_links') AND cmd IN ('UPDATE', 'DELETE', 'ALL'))
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Policy ouverte supprimée : %.% (%)', r.tablename, r.policyname, r.cmd;
  END LOOP;
END $$;

-- Les visiteurs anonymes n'ont aucune raison d'accéder à ces tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions', 'agents', 'payout_settings'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- ─── 2. Accès explicites conservés ────────────────────────────────────────
-- Transactions : l'organisateur lit celles de ses événements (l'admin a déjà
-- phase0_admin_all ; le serveur passe par service_role).
DROP POLICY IF EXISTS sec_organizer_read_transactions ON public.transactions;
CREATE POLICY sec_organizer_read_transactions ON public.transactions
  FOR SELECT TO authenticated
  USING (public.is_event_organizer(event_id));

-- Agents : l'organisateur gère les siens, l'admin tous.
DO $$
BEGIN
  IF to_regclass('public.agents') IS NOT NULL THEN
    DROP POLICY IF EXISTS sec_organizer_manage_agents ON public.agents;
    CREATE POLICY sec_organizer_manage_agents ON public.agents
      FOR ALL TO authenticated
      USING (organizer_id = (SELECT auth.uid()))
      WITH CHECK (organizer_id = (SELECT auth.uid()));
    DROP POLICY IF EXISTS sec_admin_all_agents ON public.agents;
    CREATE POLICY sec_admin_all_agents ON public.agents
      FOR ALL TO authenticated
      USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
  END IF;
END $$;

-- Coordonnées de versement : l'organisateur gère les siennes, l'admin les lit toutes.
DO $$
BEGIN
  IF to_regclass('public.payout_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS sec_owner_payout_settings ON public.payout_settings;
    CREATE POLICY sec_owner_payout_settings ON public.payout_settings
      FOR ALL TO authenticated
      USING (organizer_id = (SELECT auth.uid()))
      WITH CHECK (organizer_id = (SELECT auth.uid()));
    DROP POLICY IF EXISTS sec_admin_all_payout_settings ON public.payout_settings;
    CREATE POLICY sec_admin_all_payout_settings ON public.payout_settings
      FOR ALL TO authenticated
      USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
  END IF;
END $$;

-- Avis : modération (validation, suppression) réservée à l'admin.
DO $$
BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    DROP POLICY IF EXISTS sec_admin_moderate_reviews ON public.reviews;
    CREATE POLICY sec_admin_moderate_reviews ON public.reviews
      FOR ALL TO authenticated
      USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
  END IF;
  IF to_regclass('public.affiliate_links') IS NOT NULL THEN
    DROP POLICY IF EXISTS sec_admin_all_affiliate_links ON public.affiliate_links;
    CREATE POLICY sec_admin_all_affiliate_links ON public.affiliate_links
      FOR ALL TO authenticated
      USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
  END IF;
END $$;

COMMIT;

-- Vérification : cette requête ne doit plus renvoyer aucune ligne pour
-- transactions, agents, payout_settings ni d'écriture sur reviews / affiliate_links :
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true') ORDER BY 1;
