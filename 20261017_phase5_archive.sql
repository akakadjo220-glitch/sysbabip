-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 5 — Volume : archivage des événements terminés
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : phases 0 à 3 appliquées.
-- Ordre de déploiement : CE script → serveur (le worker lance l'archivage
-- seulement si ARCHIVE_ENABLED=true).
--
-- Idée : les tables actives ne doivent contenir que ce qui sert encore. Un
-- événement terminé depuis longtemps n'a plus besoin de ses billets (scan,
-- récupération) ni de ses commandes. Ils partent dans le schéma « archive » :
--   * archive.tickets / archive.orders : une ligne JSON par enregistrement,
--     PARTITIONNÉES PAR MOIS d'archivage → une vieille partition se détache et
--     s'exporte vers un stockage froid sans bloquer la base ;
--   * format JSON : insensible aux futures évolutions de colonnes ;
--   * archive.ticket_type_counts : répartition des billets figée, pour que les
--     statistiques des organisateurs restent justes.
--
-- Les TRANSACTIONS restent dans la table active : elles alimentent les wallets
-- et paiements des organisateurs (org_event_sales_view). Elles sont 1 par
-- commande (bien moins nombreuses que les billets) ; leur partitionnement sera
-- à prévoir au-delà de ~100 millions de lignes (voir docs/PHASE5_VOLUME.md).
--
-- Un événement n'est archivé que s'il est terminé depuis assez longtemps, sans
-- commande en attente ni paiement organisateur en cours. Restauration complète
-- possible avec restore_event().
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM PUBLIC;
GRANT USAGE ON SCHEMA archive TO service_role;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS archive.tickets (
  id          text        NOT NULL,
  event_id    uuid,
  archived_at timestamptz NOT NULL DEFAULT now(),
  data        jsonb       NOT NULL
) PARTITION BY RANGE (archived_at);
CREATE TABLE IF NOT EXISTS archive.tickets_default PARTITION OF archive.tickets DEFAULT;
CREATE INDEX IF NOT EXISTS idx_archive_tickets_event ON archive.tickets (event_id);
CREATE INDEX IF NOT EXISTS idx_archive_tickets_id ON archive.tickets (id);

CREATE TABLE IF NOT EXISTS archive.orders (
  id          uuid        NOT NULL,
  event_id    uuid,
  archived_at timestamptz NOT NULL DEFAULT now(),
  data        jsonb       NOT NULL
) PARTITION BY RANGE (archived_at);
CREATE TABLE IF NOT EXISTS archive.orders_default PARTITION OF archive.orders DEFAULT;
CREATE INDEX IF NOT EXISTS idx_archive_orders_event ON archive.orders (event_id);

CREATE TABLE IF NOT EXISTS archive.ticket_type_counts (
  event_id uuid   NOT NULL,
  name     text   NOT NULL,
  n        bigint NOT NULL,
  PRIMARY KEY (event_id, name)
);

CREATE TABLE IF NOT EXISTS archive.archived_events (
  event_id    uuid PRIMARY KEY,
  archived_at timestamptz NOT NULL DEFAULT now(),
  tickets     bigint NOT NULL,
  orders      bigint NOT NULL
);

GRANT ALL ON ALL TABLES IN SCHEMA archive TO service_role;

-- ─── 1. Partitions mensuelles à l'avance ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_archive_partitions(p_months_ahead integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_month   date;
  v_table   text;
  v_parent  text;
  v_created integer := 0;
BEGIN
  FOR i IN 0 .. greatest(p_months_ahead, 0) LOOP
    v_month := (date_trunc('month', now()) + make_interval(months => i))::date;
    FOREACH v_parent IN ARRAY ARRAY['tickets', 'orders'] LOOP
      v_table := format('%s_y%sm%s', v_parent, to_char(v_month, 'YYYY'), to_char(v_month, 'MM'));
      IF to_regclass('archive.' || v_table) IS NULL THEN
        BEGIN
          EXECUTE format('CREATE TABLE archive.%I PARTITION OF archive.%I FOR VALUES FROM (%L) TO (%L)',
                         v_table, v_parent, v_month, (v_month + interval '1 month')::date);
          v_created := v_created + 1;
        EXCEPTION WHEN others THEN
          -- Ex. : des lignes du mois sont déjà dans la partition par défaut.
          RAISE NOTICE 'Partition % non créée : %', v_table, SQLERRM;
        END;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_created;
END;
$$;

SELECT public.ensure_archive_partitions(3);

-- ─── 2. Archivage d'un événement ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_event(p_event_id uuid, p_min_age_days integer DEFAULT 365)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event   record;
  v_tickets bigint;
  v_orders  bigint;
  v_child   bigint;
BEGIN
  SELECT id, status::text AS status, date, archived_at INTO v_event
  FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'not_found');
  END IF;
  IF v_event.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'already_archived');
  END IF;
  IF v_event.status <> 'completed' OR v_event.date IS NULL
     OR v_event.date > now() - make_interval(days => greatest(p_min_age_days, 30)) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'too_recent');
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE event_id = p_event_id AND status IN ('pending', 'refund_required')) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'orders_pending');
  END IF;
  IF to_regclass('public.payout_requests') IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.payout_requests
       WHERE event_id = p_event_id AND status::text IN ('pending', 'approved', 'pending_payment', 'approved_for_print')) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'payout_pending');
  END IF;

  -- Statistiques figées avant de déplacer les billets.
  INSERT INTO archive.ticket_type_counts (event_id, name, n)
  SELECT p_event_id, coalesce(tt.name, nullif(tk.ticket_type, ''), 'Standard'), count(*)
  FROM public.tickets tk
  LEFT JOIN public.ticket_types tt ON tt.id::text = tk.ticket_type
  WHERE tk.event_id = p_event_id AND tk.status IN ('valid', 'used') AND tk.id NOT LIKE 'PHY-%'
  GROUP BY 2
  ON CONFLICT (event_id, name) DO UPDATE SET n = archive.ticket_type_counts.n + EXCLUDED.n;

  WITH moved AS (
    DELETE FROM public.tickets WHERE event_id = p_event_id RETURNING *
  )
  INSERT INTO archive.tickets (id, event_id, data)
  SELECT moved.id, moved.event_id, to_jsonb(moved) FROM moved;
  GET DIAGNOSTICS v_tickets = ROW_COUNT;

  -- Commandes : tranches (enfants) d'abord, à cause de parent_order_id.
  WITH moved AS (
    DELETE FROM public.orders WHERE event_id = p_event_id AND parent_order_id IS NOT NULL RETURNING *
  )
  INSERT INTO archive.orders (id, event_id, data)
  SELECT moved.id, moved.event_id, to_jsonb(moved) FROM moved;
  GET DIAGNOSTICS v_child = ROW_COUNT;

  WITH moved AS (
    DELETE FROM public.orders WHERE event_id = p_event_id RETURNING *
  )
  INSERT INTO archive.orders (id, event_id, data)
  SELECT moved.id, moved.event_id, to_jsonb(moved) FROM moved;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  UPDATE public.events SET archived_at = now() WHERE id = p_event_id;
  INSERT INTO archive.archived_events (event_id, tickets, orders) VALUES (p_event_id, v_tickets, v_orders + v_child)
  ON CONFLICT (event_id) DO UPDATE SET archived_at = now(), tickets = EXCLUDED.tickets, orders = EXCLUDED.orders;

  RETURN jsonb_build_object('status', 'archived', 'tickets', v_tickets, 'orders', v_orders + v_child);

EXCEPTION WHEN foreign_key_violation THEN
  -- Une table liée (ex. pointages de pass saison) référence encore ces billets :
  -- tout est annulé pour cet événement, rien n'est perdu.
  RETURN jsonb_build_object('status', 'skipped', 'reason', 'foreign_key', 'detail', SQLERRM);
END;
$$;

-- Archive par lots les événements éligibles (appelé par le worker).
CREATE OR REPLACE FUNCTION public.archive_due_events(p_min_age_days integer DEFAULT 365, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id       uuid;
  v_result   jsonb;
  v_archived integer := 0;
  v_tickets  bigint := 0;
  v_skipped  jsonb := '[]'::jsonb;
BEGIN
  FOR v_id IN
    SELECT id FROM public.events
    WHERE status::text = 'completed' AND archived_at IS NULL
      AND date < now() - make_interval(days => greatest(p_min_age_days, 30))
    ORDER BY date
    LIMIT greatest(1, least(p_limit, 200))
  LOOP
    v_result := public.archive_event(v_id, p_min_age_days);
    IF v_result->>'status' = 'archived' THEN
      v_archived := v_archived + 1;
      v_tickets := v_tickets + (v_result->>'tickets')::bigint;
    ELSE
      v_skipped := v_skipped || jsonb_build_object('event_id', v_id, 'reason', v_result->>'reason');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('archived', v_archived, 'tickets', v_tickets, 'skipped', v_skipped);
END;
$$;

-- ─── 3. Restauration (litige, contrôle a posteriori) ──────────────────────
CREATE OR REPLACE FUNCTION public.restore_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tickets bigint;
  v_orders  bigint;
  v_child   bigint;
BEGIN
  PERFORM 1 FROM public.events WHERE id = p_event_id FOR UPDATE;

  -- Commandes : parents d'abord (parent_order_id), puis tranches.
  WITH moved AS (
    DELETE FROM archive.orders WHERE event_id = p_event_id AND (data->>'parent_order_id') IS NULL RETURNING data
  )
  INSERT INTO public.orders SELECT (jsonb_populate_record(NULL::public.orders, moved.data)).* FROM moved;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  WITH moved AS (
    DELETE FROM archive.orders WHERE event_id = p_event_id RETURNING data
  )
  INSERT INTO public.orders SELECT (jsonb_populate_record(NULL::public.orders, moved.data)).* FROM moved;
  GET DIAGNOSTICS v_child = ROW_COUNT;

  WITH moved AS (
    DELETE FROM archive.tickets WHERE event_id = p_event_id RETURNING data
  )
  INSERT INTO public.tickets SELECT (jsonb_populate_record(NULL::public.tickets, moved.data)).* FROM moved;
  GET DIAGNOSTICS v_tickets = ROW_COUNT;

  DELETE FROM archive.ticket_type_counts WHERE event_id = p_event_id;
  DELETE FROM archive.archived_events WHERE event_id = p_event_id;
  UPDATE public.events SET archived_at = NULL WHERE id = p_event_id;

  RETURN jsonb_build_object('status', 'restored', 'tickets', v_tickets, 'orders', v_orders + v_child);
END;
$$;

-- ─── 4. Statistiques organisateur : billets archivés inclus ───────────────
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
        SELECT name, sum(n) AS n FROM (
          SELECT coalesce(tt.name, nullif(tk.ticket_type, ''), 'Standard') AS name, count(*) AS n
          FROM public.tickets tk
          JOIN public.events e ON e.id = tk.event_id
          LEFT JOIN public.ticket_types tt ON tt.id::text = tk.ticket_type
          WHERE e.organizer_id = v_uid AND tk.status IN ('valid', 'used') AND tk.id NOT LIKE 'PHY-%'
          GROUP BY 1
          UNION ALL
          SELECT c.name, c.n
          FROM archive.ticket_type_counts c
          JOIN public.events e ON e.id = c.event_id
          WHERE e.organizer_id = v_uid
        ) u GROUP BY name
      ) x));
END;
$$;

-- ─── 5. Taille des tables (suivi du volume) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.table_sizes()
RETURNS TABLE (table_name text, rows_estimate bigint, total_size text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT n.nspname || '.' || c.relname, c.reltuples::bigint, pg_size_pretty(pg_total_relation_size(c.oid))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'archive') AND c.relkind IN ('r', 'p')
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 30;
$$;

-- ─── 6. Droits ────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('ensure_archive_partitions', 'archive_event', 'archive_due_events', 'restore_event', 'table_sizes')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.organizer_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.organizer_overview(integer) TO authenticated, service_role;

COMMIT;
