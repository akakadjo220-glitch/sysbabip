-- ═══════════════════════════════════════════════════════════════════════════
-- TABLEAU DE BORD ORGANISATEUR À GRANDE ÉCHELLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Le tableau de bord chargeait TOUTES les transactions de l'organisateur dans le
-- navigateur, puis faisait ses totaux. Au-delà de 1 000 lignes, Supabase coupe
-- silencieusement : totaux faux, listes incomplètes, et chargement de plus en
-- plus lent. Ici, la base calcule et ne renvoie que le résultat.
--
-- Fonctions (organisateur connecté, uniquement SES événements) :
--   organizer_ambassador_commissions()            commissions ambassadeurs / événement
--   organizer_agent_cash()                        espèces encaissées / agent
--   organizer_buyer_zones(p_event_id)             acheteurs par quartier / ville (carte, export Meta)
--   organizer_contacts(p_event_id, limit, offset) contacts dédoublonnés, paginés
--
-- Lecture seule, sans effet sur les données. Peut être exécuté à tout moment.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Index utiles aux listes paginées et aux totaux par événement.
CREATE INDEX IF NOT EXISTS idx_transactions_event_status_created
  ON public.transactions (event_id, status, created_at DESC);

-- ─── 1. Commissions ambassadeurs par événement ────────────────────────────
CREATE OR REPLACE FUNCTION public.organizer_ambassador_commissions()
RETURNS TABLE (event_id uuid, total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT t.event_id, sum(t.ambassador_commission)::numeric
    FROM public.transactions t
    JOIN public.events e ON e.id = t.event_id
    WHERE e.organizer_id = v_uid
      AND t.ambassador_commission > 0
      AND t.status <> 'valid'
    GROUP BY t.event_id;
END;
$$;

-- ─── 2. Espèces encaissées par agent ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.organizer_agent_cash()
RETURNS TABLE (agent_id uuid, collected numeric, sales bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT t.agent_id, coalesce(sum(t.amount), 0)::numeric, count(*)
    FROM public.transactions t
    JOIN public.events e ON e.id = t.event_id
    WHERE e.organizer_id = v_uid
      AND t.agent_id IS NOT NULL
      AND t.is_cash
      AND t.status = 'completed'
    GROUP BY t.agent_id;
END;
$$;

-- ─── 3. Acheteurs par zone (carte marketing, export Meta Ads) ─────────────
CREATE OR REPLACE FUNCTION public.organizer_buyer_zones(p_event_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  RETURN (
    WITH located AS (
      SELECT
        coalesce(nullif(t.buyer_location->>'neighborhood', ''), nullif(t.buyer_location->>'suburb', ''),
                 nullif(t.buyer_location->>'district', ''), '') AS commune,
        coalesce(nullif(t.buyer_location->>'city', ''), nullif(t.buyer_location->>'town', ''),
                 nullif(t.buyer_location->>'village', ''), 'Inconnu') AS city,
        coalesce(nullif(t.buyer_location->>'country_code', ''), 'CI') AS country,
        CASE WHEN (t.buyer_location->>'lat') ~ '^-?[0-9.]+$' THEN (t.buyer_location->>'lat')::numeric END AS lat,
        CASE WHEN (t.buyer_location->>'lng') ~ '^-?[0-9.]+$' THEN (t.buyer_location->>'lng')::numeric END AS lng,
        t.amount,
        extract(hour FROM t.created_at)::int AS hour
      FROM public.transactions t
      JOIN public.events e ON e.id = t.event_id
      WHERE e.organizer_id = v_uid
        AND (p_event_id IS NULL OR t.event_id = p_event_id)
        AND t.status = 'completed'
        AND t.buyer_location IS NOT NULL
    ),
    zones AS (
      SELECT commune, city, country,
             round(avg(lat), 5) AS lat, round(avg(lng), 5) AS lng,
             count(*) AS buyers, coalesce(sum(amount), 0) AS total_amount,
             mode() WITHIN GROUP (ORDER BY hour) AS peak_hour
      FROM located
      GROUP BY commune, city, country
      ORDER BY count(*) DESC
      LIMIT 1000
    )
    SELECT jsonb_build_object(
      'total_buyers', (SELECT count(*) FROM located),
      'zones', coalesce((SELECT jsonb_agg(to_jsonb(z) ORDER BY z.buyers DESC) FROM zones z), '[]'::jsonb)
    )
  );
END;
$$;

-- ─── 4. Contacts acheteurs dédoublonnés, paginés ──────────────────────────
CREATE OR REPLACE FUNCTION public.organizer_contacts(
  p_event_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  RETURN (
    WITH latest AS (
      -- Un contact = un e-mail (sinon un nom) ; on garde son achat le plus récent.
      SELECT DISTINCT ON (coalesce(lower(nullif(t.guest_email, '')), t.guest_name))
             t.guest_name, t.guest_email, t.buyer_phone, t.amount, t.event_id, t.created_at, e.title AS event_title
      FROM public.transactions t
      JOIN public.events e ON e.id = t.event_id
      WHERE e.organizer_id = v_uid
        AND (p_event_id IS NULL OR t.event_id = p_event_id)
        AND t.status = 'completed'
        AND coalesce(nullif(t.guest_email, ''), nullif(t.guest_name, '')) IS NOT NULL
      ORDER BY coalesce(lower(nullif(t.guest_email, '')), t.guest_name), t.created_at DESC
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM latest),
      'with_email', (SELECT count(*) FROM latest WHERE nullif(guest_email, '') IS NOT NULL),
      'rows', coalesce((
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC)
        FROM (SELECT * FROM latest ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) p
      ), '[]'::jsonb)
    )
  );
END;
$$;

-- ─── Droits : organisateurs connectés uniquement ──────────────────────────
REVOKE ALL ON FUNCTION public.organizer_ambassador_commissions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organizer_agent_cash() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organizer_buyer_zones(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organizer_contacts(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.organizer_ambassador_commissions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.organizer_agent_cash() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.organizer_buyer_zones(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.organizer_contacts(uuid, integer, integer) TO authenticated, service_role;

COMMIT;
