-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1b — Scanner des agents, transfert de billet, fin de l'accès anonyme
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : phases 0 et 1a appliquées.
-- Ordre de déploiement : serveur → site → CE script.
--
--   * agent_authenticate  : connexion agent (PIN haché, verrouillage après 5 échecs).
--                           Le serveur délivre ensuite un jeton signé de 12 h.
--   * scanner_check_in    : scan atomique, limité aux événements de l'agent.
--   * scanner_ticket_snapshot : cache hors-ligne, limité aux événements de l'agent.
--   * transfer_ticket     : réécrit (verrou, identifiant aléatoire, QR = identifiant).
--   * La table tickets n'est plus lisible ni modifiable anonymement.
-- Fonctions réservées au service_role (serveur).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS scanned_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS scanned_by uuid;
CREATE INDEX IF NOT EXISTS idx_tickets_qr_code ON public.tickets(qr_code);
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON public.tickets(event_id, status);
-- Index non unique : d'éventuels codes en double existants ne doivent pas bloquer la migration.
CREATE INDEX IF NOT EXISTS idx_agents_code_upper ON public.agents(upper(agent_code));

-- ─── 1. Connexion agent ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_authenticate(p_agent_code text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_agent public.agents;
  v_valid boolean;
BEGIN
  SELECT * INTO v_agent FROM public.agents
  WHERE upper(agent_code) = upper(btrim(p_agent_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Identifiant Agent ou Code PIN invalide.');
  END IF;
  IF v_agent.locked_until IS NOT NULL AND v_agent.locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trop de tentatives. Compte bloqué 15 minutes.');
  END IF;
  IF v_agent.is_active = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ce compte agent est désactivé. Contactez votre organisateur.');
  END IF;

  IF v_agent.pin_hash IS NOT NULL THEN
    v_valid := v_agent.pin_hash = crypt(p_pin, v_agent.pin_hash);
  ELSE
    v_valid := v_agent.auth_pin IS NOT NULL AND v_agent.auth_pin = p_pin;
  END IF;

  IF NOT v_valid THEN
    UPDATE public.agents
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
     WHERE id = v_agent.id;
    RETURN jsonb_build_object('success', false, 'error', 'Identifiant Agent ou Code PIN invalide.');
  END IF;

  UPDATE public.agents SET failed_attempts = 0, locked_until = NULL WHERE id = v_agent.id;

  -- PIN encore en clair : on le hache et on efface la version lisible.
  IF v_agent.pin_hash IS NULL THEN
    UPDATE public.agents SET pin_hash = crypt(p_pin, gen_salt('bf')) WHERE id = v_agent.id;
    BEGIN
      UPDATE public.agents SET auth_pin = NULL WHERE id = v_agent.id;
    EXCEPTION WHEN not_null_violation THEN
      NULL;  -- colonne NOT NULL : on la laisse, le hash est désormais prioritaire
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'agent', jsonb_build_object(
      'id', v_agent.id, 'name', v_agent.name, 'agent_code', v_agent.agent_code,
      'agent_type', v_agent.agent_type, 'event_id', v_agent.event_id,
      'organizer_id', v_agent.organizer_id, 'is_active', v_agent.is_active
    )
  );
END;
$$;

-- ─── 2. Scan atomique ─────────────────────────────────────────────────────
-- Résultats : ok | already_used | revoked | partial | transferred | invalid |
--             not_found | wrong_event | agent_disabled | season_ok | season_already
CREATE OR REPLACE FUNCTION public.scanner_check_in(p_agent_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agent      public.agents;
  v_ticket     public.tickets;
  v_tj         jsonb;
  v_code       text := btrim(coalesce(p_code, ''));
  v_in_scope   boolean;
  v_tournament text;
  v_status     text;
  v_rows       integer;
  v_type_name  text;
BEGIN
  SELECT * INTO v_agent FROM public.agents WHERE id = p_agent_id;
  IF NOT FOUND OR v_agent.is_active = false THEN
    RETURN jsonb_build_object('result', 'agent_disabled');
  END IF;
  IF v_code = '' OR length(v_code) > 2000 THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_code;
  IF NOT FOUND THEN
    SELECT * INTO v_ticket FROM public.tickets WHERE qr_code = v_code LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  v_tj := to_jsonb(v_ticket);
  v_tournament := v_tj->>'tournament_id';
  SELECT name INTO v_type_name FROM public.ticket_types WHERE id::text = v_ticket.ticket_type;

  -- Pass saison : valable pour chaque match du tournoi, une fois par match.
  IF v_tournament IS NOT NULL THEN
    IF v_agent.event_id IS NULL
       OR (SELECT to_jsonb(e)->>'tournament_id' FROM public.events e WHERE e.id = v_agent.event_id) IS DISTINCT FROM v_tournament THEN
      RETURN jsonb_build_object('result', 'wrong_event');
    END IF;
    IF v_ticket.status <> 'valid' THEN
      RETURN jsonb_build_object('result', CASE v_ticket.status WHEN 'revoked' THEN 'revoked' ELSE 'invalid' END);
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_ticket.id || ':' || v_agent.event_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.season_pass_checkins WHERE ticket_id = v_ticket.id AND event_id = v_agent.event_id) THEN
      RETURN jsonb_build_object('result', 'season_already');
    END IF;
    INSERT INTO public.season_pass_checkins (ticket_id, event_id, pass_id)
    SELECT t.id, v_agent.event_id, t.pass_id FROM public.tickets t WHERE t.id = v_ticket.id;

    RETURN jsonb_build_object('result', 'season_ok', 'ticket', jsonb_build_object(
      'id', v_ticket.id, 'guest_name', v_ticket.guest_name, 'ticket_type', '🎟️ Pass Saison', 'event_id', v_ticket.event_id));
  END IF;

  -- Billet classique : uniquement pour l'événement de l'agent, ou les événements
  -- de son organisateur si l'agent n'est rattaché à aucun événement.
  IF v_agent.event_id IS NOT NULL THEN
    v_in_scope := v_ticket.event_id = v_agent.event_id;
  ELSE
    v_in_scope := EXISTS (SELECT 1 FROM public.events WHERE id = v_ticket.event_id AND organizer_id = v_agent.organizer_id);
  END IF;
  IF NOT v_in_scope THEN
    RETURN jsonb_build_object('result', 'wrong_event');
  END IF;

  UPDATE public.tickets
     SET status = 'used', scanned_at = now(), scanned_by = v_agent.id
   WHERE id = v_ticket.id AND status = 'valid';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    v_status := 'ok';
  ELSE
    SELECT status INTO v_status FROM public.tickets WHERE id = v_ticket.id;
    v_status := CASE v_status
      WHEN 'used' THEN 'already_used'
      WHEN 'revoked' THEN 'revoked'
      WHEN 'partial' THEN 'partial'
      WHEN 'transferred' THEN 'transferred'
      ELSE 'invalid' END;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_ticket.id;
  RETURN jsonb_build_object('result', v_status, 'ticket', jsonb_build_object(
    'id', v_ticket.id, 'guest_name', v_ticket.guest_name,
    'ticket_type', coalesce(v_type_name, v_ticket.ticket_type, 'Standard'),
    'event_id', v_ticket.event_id, 'scanned_at', v_ticket.scanned_at));
END;
$$;

-- ─── 3. Cache hors-ligne de l'agent ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scanner_ticket_snapshot(p_agent_id uuid)
RETURNS TABLE (id text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agent public.agents;
BEGIN
  SELECT * INTO v_agent FROM public.agents a WHERE a.id = p_agent_id AND a.is_active IS DISTINCT FROM false;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_agent.event_id IS NOT NULL THEN
    RETURN QUERY
      SELECT t.id, t.status FROM public.tickets t
      WHERE t.event_id = v_agent.event_id AND t.status IN ('valid', 'used', 'revoked', 'partial')
      LIMIT 100000;
  ELSE
    -- Agent sans événement : événements de l'organisateur en cours ou à venir.
    RETURN QUERY
      SELECT t.id, t.status FROM public.tickets t
      JOIN public.events e ON e.id = t.event_id
      WHERE e.organizer_id = v_agent.organizer_id
        AND e.date > now() - interval '2 days'
        AND t.status IN ('valid', 'used', 'revoked', 'partial')
      LIMIT 100000;
  END IF;
END;
$$;

-- ─── 4. Transfert de billet ───────────────────────────────────────────────
-- Verrouille le billet (pas de double transfert), identifiant aléatoire,
-- QR = identifiant (même format que les billets émis par finalize_order).
CREATE OR REPLACE FUNCTION public.transfer_ticket(
    p_ticket_id   text,
    p_new_name    text,
    p_new_contact text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_ticket    public.tickets%ROWTYPE;
    v_new_ticket_id text;
BEGIN
    IF coalesce(btrim(p_new_name), '') = '' OR coalesce(btrim(p_new_contact), '') = '' THEN
        RETURN json_build_object('success', false, 'error', 'Nom et contact du destinataire requis');
    END IF;

    SELECT * INTO v_old_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Billet introuvable');
    END IF;
    IF v_old_ticket.status <> 'valid' THEN
        RETURN json_build_object('success', false, 'error', 'Le billet n''est plus valide ou a déjà été utilisé/transféré');
    END IF;

    UPDATE public.tickets SET status = 'transferred' WHERE id = p_ticket_id;

    v_new_ticket_id := 'TIX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));

    INSERT INTO public.tickets (id, event_id, transaction_id, guest_name, guest_email, ticket_type, status, qr_code)
    VALUES (v_new_ticket_id, v_old_ticket.event_id, v_old_ticket.transaction_id,
            left(p_new_name, 200), left(p_new_contact, 320), v_old_ticket.ticket_type, 'valid', v_new_ticket_id);

    INSERT INTO public.ticket_transfers (old_ticket_id, new_ticket_id, recipient_name, recipient_contact)
    VALUES (p_ticket_id, v_new_ticket_id, left(p_new_name, 200), left(p_new_contact, 320));

    RETURN json_build_object(
        'success', true,
        'new_ticket_id', v_new_ticket_id,
        'event_id', v_old_ticket.event_id,
        'ticket_type', v_old_ticket.ticket_type
    );
END;
$$;

-- ─── 5. Droits ────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('agent_authenticate', 'scanner_check_in', 'scanner_ticket_snapshot',
                        'transfer_ticket', 'agent_login')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
    RAISE NOTICE 'Réservée au serveur : %', r.fn;
  END LOOP;
END $$;

-- ─── 6. tickets : plus d'accès anonyme ────────────────────────────────────
-- Les acheteurs reçoivent leurs billets du serveur ; les agents passent par le
-- serveur ; seuls l'admin et l'organisateur de l'événement accèdent à la table.
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tickets'
      AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.tickets', r.policyname);
    RAISE NOTICE 'Policy ouverte supprimée : tickets.%', r.policyname;
  END LOOP;

  IF to_regclass('public.season_pass_checkins') IS NOT NULL THEN
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'season_pass_checkins'
        AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.season_pass_checkins', r.policyname);
      RAISE NOTICE 'Policy ouverte supprimée : season_pass_checkins.%', r.policyname;
    END LOOP;
  END IF;
END $$;

REVOKE ALL ON public.tickets FROM anon;

DROP POLICY IF EXISTS phase1b_admin_all ON public.tickets;
CREATE POLICY phase1b_admin_all ON public.tickets
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS phase1b_organizer_select ON public.tickets;
CREATE POLICY phase1b_organizer_select ON public.tickets
  FOR SELECT TO authenticated
  USING (public.is_event_organizer(event_id));

DROP POLICY IF EXISTS phase1b_organizer_update ON public.tickets;
CREATE POLICY phase1b_organizer_update ON public.tickets
  FOR UPDATE TO authenticated
  USING (public.is_event_organizer(event_id))
  WITH CHECK (public.is_event_organizer(event_id));

COMMIT;

-- ─── Vérifications ─────────────────────────────────────────────────────────
-- 1. Avec la clé anon : GET /rest/v1/tickets?select=id → [] ou 401.
-- 2. POST /rest/v1/rpc/agent_login → permission denied.
-- 3. Un agent rattaché à l'événement A ne peut pas valider un billet de l'événement B.
