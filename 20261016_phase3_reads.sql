-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 3 — Lectures à grande échelle : index, compteurs, statistiques en SQL
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : phases 0 à 2 appliquées.
-- Ordre de déploiement : CE script → serveur → site (tout est additif ; le site
-- actuel continue de fonctionner, il bénéficie juste des nouveaux index).
--
--   * Index pour les requêtes réelles du site (catalogue, billets, transactions).
--     Sur une base déjà volumineuse, préférez créer chaque index à part avec
--     CREATE INDEX CONCURRENTLY (hors transaction) pour ne pas bloquer les écritures.
--   * Compteurs de vues / clics répartis : chaque visite écrivait sur LA ligne de
--     l'événement (verrou partagé par tous les visiteurs pendant un pic). Les
--     visites vont dans des compteurs répartis, agrégés toutes les minutes.
--   * Statistiques admin / organisateur calculées en SQL : les totaux affichés
--     ne sont plus faussés au-delà de 1000 transactions.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Index ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_catalog ON public.events (status, country, date);
CREATE INDEX IF NOT EXISTS idx_events_slug ON public.events (slug);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON public.events (organizer_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON public.ticket_types (event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_created ON public.tickets (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_transaction ON public.tickets (transaction_id);
CREATE INDEX IF NOT EXISTS idx_tickets_guest_email_lower ON public.tickets (lower(guest_email));
CREATE INDEX IF NOT EXISTS idx_transactions_event_created ON public.transactions (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status_created ON public.transactions (status, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.payout_requests') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_payout_requests_org_status ON public.payout_requests (organizer_id, status);
    CREATE INDEX IF NOT EXISTS idx_payout_requests_type_status ON public.payout_requests (type, status);
  END IF;
  IF to_regclass('public.ticket_transfers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ticket_transfers_old ON public.ticket_transfers (old_ticket_id);
  END IF;
  IF to_regclass('public.ambassador_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ambassador_links_code ON public.ambassador_links (code);
  END IF;
END $$;

-- ─── 2. Compteurs répartis (vues d'événements, clics ambassadeurs) ────────
CREATE TABLE IF NOT EXISTS public.event_view_counters (
  event_id uuid     NOT NULL,
  shard    smallint NOT NULL,
  views    bigint   NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, shard)
);
CREATE TABLE IF NOT EXISTS public.ambassador_click_counters (
  code   text     NOT NULL,
  shard  smallint NOT NULL,
  clicks bigint   NOT NULL DEFAULT 0,
  PRIMARY KEY (code, shard)
);
ALTER TABLE public.event_view_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_click_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_view_counters, public.ambassador_click_counters FROM anon, authenticated;
GRANT ALL ON public.event_view_counters, public.ambassador_click_counters TO service_role;

-- Même signature qu'avant : le site n'a pas besoin de changer.
CREATE OR REPLACE FUNCTION public.increment_event_view(evt_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.event_view_counters (event_id, shard, views)
  SELECT evt_id, floor(random() * 16)::smallint, 1
  WHERE EXISTS (SELECT 1 FROM public.events WHERE id = evt_id)
  ON CONFLICT (event_id, shard) DO UPDATE SET views = public.event_view_counters.views + 1;
$$;

CREATE OR REPLACE FUNCTION public.increment_ambassador_clicks(p_code text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.ambassador_click_counters (code, shard, clicks)
  SELECT left(p_code, 64), floor(random() * 16)::smallint, 1
  WHERE EXISTS (SELECT 1 FROM public.ambassador_links WHERE code = p_code)
  ON CONFLICT (code, shard) DO UPDATE SET clicks = public.ambassador_click_counters.clicks + 1;
$$;

-- Agrégation : déplace atomiquement les compteurs vers events.views / ambassador_links.clicks.
CREATE OR REPLACE FUNCTION public.rollup_counters()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_events integer;
  v_links  integer;
BEGIN
  WITH moved AS (
    DELETE FROM public.event_view_counters RETURNING event_id, views
  ), totals AS (
    SELECT event_id, sum(views) AS total FROM moved GROUP BY event_id
  )
  UPDATE public.events e SET views = coalesce(e.views, 0) + t.total
  FROM totals t WHERE e.id = t.event_id;
  GET DIAGNOSTICS v_events = ROW_COUNT;

  WITH moved AS (
    DELETE FROM public.ambassador_click_counters RETURNING code, clicks
  ), totals AS (
    SELECT code, sum(clicks) AS total FROM moved GROUP BY code
  )
  UPDATE public.ambassador_links l SET clicks = coalesce(l.clicks, 0) + t.total
  FROM totals t WHERE l.code = t.code;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  RETURN jsonb_build_object('events', v_events, 'ambassador_links', v_links);
END;
$$;

-- ─── 3. Statistiques calculées en SQL ─────────────────────────────────────
-- KPIs admin filtrés (mêmes règles que l'écran : ventes en ligne, hors « valid » physiques).
CREATE OR REPLACE FUNCTION public.admin_transaction_kpis(
  p_event_id uuid DEFAULT NULL, p_organizer_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'revenue', coalesce(sum(t.amount), 0),
    'commission', coalesce(sum(t.commission_amount), 0),
    'ambassador_commission', coalesce(sum(t.ambassador_commission), 0),
    'trx_count', count(*))
  INTO v_result
  FROM public.transactions t
  JOIN public.events e ON e.id = t.event_id
  WHERE t.status <> 'valid'
    AND (p_event_id IS NULL OR t.event_id = p_event_id)
    AND (p_organizer_id IS NULL OR e.organizer_id = p_organizer_id)
    AND (p_from IS NULL OR t.created_at >= p_from)
    AND (p_to IS NULL OR t.created_at <= p_to);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_global_totals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'ambassador_commission', (SELECT coalesce(sum(ambassador_commission), 0) FROM public.transactions WHERE status <> 'valid'),
    'cash_advance', (SELECT coalesce(sum(amount), 0) FROM public.payout_requests WHERE type = 'cash_advance' AND status::text = 'paid'),
    'physical_compensation', (SELECT coalesce(sum(amount), 0) FROM public.payout_requests WHERE type = 'physical_commission' AND status::text = 'paid'));
END;
$$;

-- Vue d'ensemble de l'organisateur connecté (ses événements uniquement).
CREATE OR REPLACE FUNCTION public.organizer_overview(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_days integer := least(greatest(p_days, 1), 90);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'revenue', (
      SELECT coalesce(sum(t.amount), 0) FROM public.transactions t
      JOIN public.events e ON e.id = t.event_id
      WHERE e.organizer_id = v_uid AND t.status = 'completed'),
    'daily', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('day', d.day::date, 'sales', coalesce(s.sales, 0), 'tickets', coalesce(s.trx, 0)) ORDER BY d.day), '[]'::jsonb)
      FROM generate_series(current_date - (v_days - 1), current_date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT t.created_at::date AS day, sum(t.amount) AS sales, count(*) AS trx
        FROM public.transactions t JOIN public.events e ON e.id = t.event_id
        WHERE e.organizer_id = v_uid AND t.status = 'completed'
          AND t.created_at >= current_date - (v_days - 1)
        GROUP BY 1
      ) s ON s.day = d.day::date),
    'ticket_distribution', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'value', x.n) ORDER BY x.n DESC), '[]'::jsonb)
      FROM (
        SELECT coalesce(tt.name, nullif(tk.ticket_type, ''), 'Standard') AS name, count(*) AS n
        FROM public.tickets tk
        JOIN public.events e ON e.id = tk.event_id
        LEFT JOIN public.ticket_types tt ON tt.id::text = tk.ticket_type
        WHERE e.organizer_id = v_uid AND tk.status IN ('valid', 'used') AND tk.id NOT LIKE 'PHY-%'
        GROUP BY 1
      ) x));
END;
$$;

-- ─── 4. Droits ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.rollup_counters() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_counters() TO service_role;
REVOKE ALL ON FUNCTION public.increment_event_view(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_ambassador_clicks(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_event_view(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_ambassador_clicks(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_transaction_kpis(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_global_totals() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organizer_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transaction_kpis(uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_global_totals() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.organizer_overview(integer) TO authenticated, service_role;

COMMIT;
