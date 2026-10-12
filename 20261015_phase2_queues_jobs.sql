-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 2 — Files d'attente durables, tâches planifiées sûres, limites partagées
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : phases 0 et 1 appliquées.
-- Ordre de déploiement : CE script → serveur (le nouveau worker utilise ces
-- fonctions ; l'ancien serveur reste compatible avec les colonnes ajoutées).
--
--   * queue_claim / queue_complete / queue_fail : dépilage par lots avec
--     FOR UPDATE SKIP LOCKED. Plusieurs workers ne prennent jamais le même
--     message ; un worker arrêté en plein envoi rend ses messages après 10 min ;
--     les échecs sont réessayés avec un délai croissant.
--   * dedupe_key : un même rappel / remerciement n'est mis en file qu'une fois,
--     même si la tâche tourne plusieurs fois ou sur plusieurs serveurs.
--   * claim_job_lease : une tâche planifiée ne tourne que sur une instance à la fois.
--   * rate_limit_hit : compteur de limitation partagé entre toutes les instances.
-- Toutes ces fonctions sont réservées au service_role.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Colonnes de file ──────────────────────────────────────────────────
DO $$
DECLARE q text;
BEGIN
  FOREACH q IN ARRAY ARRAY['email_queue', 'whatsapp_queue'] LOOP
    IF to_regclass('public.' || q) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()', q);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now()', q);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS locked_at timestamptz', q);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS locked_by text', q);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS dedupe_key text', q);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS processed_at timestamptz', q);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS error_msg text', q);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_' || q || '_dedupe') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (dedupe_key)', q, 'uq_' || q || '_dedupe');
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (next_attempt_at) WHERE status = ''pending''', 'idx_' || q || '_ready', q);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (locked_at) WHERE status = ''processing''', 'idx_' || q || '_processing', q);
  END LOOP;
END $$;

-- ─── 2. Dépilage ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_claim(p_queue text, p_worker text, p_limit integer DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_queue NOT IN ('email_queue', 'whatsapp_queue') THEN
    RAISE EXCEPTION 'UNKNOWN_QUEUE';
  END IF;
  RETURN QUERY EXECUTE format($q$
    WITH ready AS (
      SELECT id FROM public.%1$I
      WHERE (status = 'pending' AND next_attempt_at <= now())
         OR (status = 'processing' AND locked_at < now() - interval '10 minutes')
      ORDER BY next_attempt_at
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.%1$I q
       SET status = 'processing', locked_at = now(), locked_by = $1, attempts = q.attempts + 1
      FROM ready
     WHERE q.id = ready.id
    RETURNING to_jsonb(q.*)
  $q$, p_queue) USING p_worker, greatest(1, least(p_limit, 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_complete(p_queue text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_queue NOT IN ('email_queue', 'whatsapp_queue') THEN
    RAISE EXCEPTION 'UNKNOWN_QUEUE';
  END IF;
  EXECUTE format('UPDATE public.%I SET status = ''sent'', processed_at = now(), locked_at = NULL, error_msg = NULL WHERE id = $1', p_queue)
  USING p_id;
END;
$$;

-- Échec : nouvel essai dans 1, 2, 4, 8… minutes (max 1 h), puis « failed ».
CREATE OR REPLACE FUNCTION public.queue_fail(p_queue text, p_id uuid, p_error text, p_max_attempts integer DEFAULT 5)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_queue NOT IN ('email_queue', 'whatsapp_queue') THEN
    RAISE EXCEPTION 'UNKNOWN_QUEUE';
  END IF;
  EXECUTE format($q$
    UPDATE public.%I
       SET status = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'pending' END,
           next_attempt_at = now() + least(interval '1 minute' * power(2, greatest(attempts - 1, 0)), interval '1 hour'),
           locked_at = NULL,
           error_msg = left($2, 1000)
     WHERE id = $1
    RETURNING status
  $q$, p_queue) INTO v_status USING p_id, p_error, p_max_attempts;
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'email', (SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.email_queue GROUP BY status) s),
    'whatsapp', (SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.whatsapp_queue GROUP BY status) s),
    'oldest_pending_seconds', (SELECT extract(epoch FROM now() - min(created_at))::int FROM public.email_queue WHERE status = 'pending'));
$$;

-- ─── 3. Verrou des tâches planifiées ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_leases (
  name         text PRIMARY KEY,
  locked_until timestamptz NOT NULL DEFAULT '-infinity',
  locked_by    text,
  last_run_at  timestamptz
);
ALTER TABLE public.job_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_leases FROM anon, authenticated;
GRANT ALL ON public.job_leases TO service_role;

-- Vrai si l'appelant obtient le droit d'exécuter la tâche : personne d'autre ne
-- la détient et le dernier passage date d'au moins p_min_interval secondes.
CREATE OR REPLACE FUNCTION public.claim_job_lease(p_name text, p_worker text, p_ttl_seconds integer, p_min_interval_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.job_leases (name) VALUES (p_name) ON CONFLICT (name) DO NOTHING;
  UPDATE public.job_leases
     SET locked_until = now() + make_interval(secs => p_ttl_seconds),
         locked_by = p_worker,
         last_run_at = now()
   WHERE name = p_name
     AND locked_until < now()
     AND (last_run_at IS NULL OR last_run_at < now() - make_interval(secs => p_min_interval_seconds));
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_job_lease(p_name text, p_worker text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.job_leases SET locked_until = now() WHERE name = p_name AND locked_by = p_worker;
$$;

-- ─── 4. Limitation de débit partagée ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;

-- Fenêtre fixe : renvoie le nombre de requêtes de la clé dans la fenêtre courante.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_window_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_hits  integer;
BEGIN
  INSERT INTO public.rate_limits (key, window_start, hits) VALUES (left(p_key, 200), v_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = public.rate_limits.hits + 1
  RETURNING hits INTO v_hits;
  RETURN jsonb_build_object('hits', v_hits, 'reset_at', v_start + make_interval(secs => p_window_seconds));
END;
$$;

CREATE OR REPLACE FUNCTION public.rate_limit_decrement(p_key text, p_window_seconds integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.rate_limits SET hits = greatest(hits - 1, 0)
   WHERE key = left(p_key, 200)
     AND window_start = to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
$$;

CREATE OR REPLACE FUNCTION public.rate_limit_reset(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.rate_limits WHERE key = left(p_key, 200);
$$;

-- ─── 5. Nettoyage ─────────────────────────────────────────────────────────
-- Messages envoyés de plus de 30 jours, compteurs expirés, OTP périmés.
CREATE OR REPLACE FUNCTION public.purge_operational_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email integer := 0;
  v_wa    integer := 0;
  v_rl    integer;
  v_otp   integer;
BEGIN
  IF to_regclass('public.email_queue') IS NOT NULL THEN
    DELETE FROM public.email_queue WHERE status = 'sent' AND processed_at < now() - interval '30 days';
    GET DIAGNOSTICS v_email = ROW_COUNT;
  END IF;
  IF to_regclass('public.whatsapp_queue') IS NOT NULL THEN
    DELETE FROM public.whatsapp_queue WHERE status = 'sent' AND processed_at < now() - interval '30 days';
    GET DIAGNOSTICS v_wa = ROW_COUNT;
  END IF;
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  GET DIAGNOSTICS v_rl = ROW_COUNT;
  DELETE FROM public.auth_otps WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS v_otp = ROW_COUNT;
  RETURN jsonb_build_object('email', v_email, 'whatsapp', v_wa, 'rate_limits', v_rl, 'otps', v_otp);
END;
$$;

-- ─── 6. Droits ────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('queue_claim', 'queue_complete', 'queue_fail', 'queue_stats', 'claim_job_lease',
                        'release_job_lease', 'rate_limit_hit', 'rate_limit_decrement', 'rate_limit_reset',
                        'purge_operational_data')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;
END $$;

COMMIT;
