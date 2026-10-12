-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1a — Achat côté serveur (commandes, réservation atomique, émission)
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : migration 20261011_phase0_security_hardening.sql appliquée.
-- Ordre de déploiement : serveur → site → CE script.
--
-- Principe :
--   1. create_order      : le serveur calcule le prix depuis ticket_types et
--                          réserve le stock en une instruction atomique
--                          (impossible de vendre plus que la jauge).
--   2. finalize_order    : appelé uniquement après confirmation du paiement par
--                          l'opérateur (vérification serveur à serveur). Idempotent :
--                          un webhook rejoué n'émet jamais deux fois les billets.
--   3. release_order     : libère le stock d'une commande échouée / expirée.
-- Toutes ces fonctions sont réservées au service_role (serveur).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Table des commandes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token    text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  items           jsonb NOT NULL,              -- [{ticket_type_id, name, qty, unit_price}]
  quantity        integer NOT NULL CHECK (quantity > 0),
  total_amount    numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  amount_due      numeric(12,2) NOT NULL CHECK (amount_due >= 0),
  currency        text NOT NULL DEFAULT 'XOF',
  payment_mode    text NOT NULL DEFAULT 'full' CHECK (payment_mode IN ('full', 'installment')),
  provider        text NOT NULL,
  provider_ref    text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'amount_mismatch', 'refund_required')),
  buyer_name      text,
  buyer_email     text,
  buyer_phone     text,
  contact_method  text,
  buyer_location  jsonb,
  referral_code   text,
  transaction_id  uuid,
  ticket_ids      text[],
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  paid_at         timestamptz,
  last_checked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_provider_ref ON public.orders(provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pending_expiry ON public.orders(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_orders_event ON public.orders(event_id, created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;   -- aucune policy : accès serveur uniquement
REVOKE ALL ON public.orders FROM anon, authenticated;
GRANT ALL ON public.orders TO service_role;

-- Traçabilité commande ↔ transaction / billets
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_order ON public.transactions(order_id) WHERE order_id IS NOT NULL;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS order_id uuid;
CREATE INDEX IF NOT EXISTS idx_tickets_order ON public.tickets(order_id) WHERE order_id IS NOT NULL;

-- Garde-fou de stock (NOT VALID : n'échoue pas sur d'éventuelles anciennes lignes incohérentes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ticket_types_stock') THEN
    ALTER TABLE public.ticket_types
      ADD CONSTRAINT chk_ticket_types_stock CHECK (coalesce(sold, 0) >= 0 AND coalesce(sold, 0) <= quantity) NOT VALID;
  END IF;
END $$;

-- ─── 2. Réservation : create_order ────────────────────────────────────────
-- p_items : [{"id": "<ticket_type uuid>", "qty": 2}, ...]
CREATE OR REPLACE FUNCTION public.create_order(
  p_event_id       uuid,
  p_items          jsonb,
  p_payment_mode   text,
  p_provider       text,
  p_buyer          jsonb,
  p_referral_code  text DEFAULT NULL,
  p_buyer_location jsonb DEFAULT NULL,
  p_ttl_minutes    integer DEFAULT 15
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event      record;
  v_item       jsonb;
  v_qty        integer;
  v_tt         record;
  v_items      jsonb := '[]'::jsonb;
  v_total      numeric(12,2) := 0;
  v_quantity   integer := 0;
  v_order      public.orders;
BEGIN
  IF p_payment_mode NOT IN ('full', 'installment') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_MODE';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END IF;

  SELECT id, status::text AS status, date, coalesce(sales_close_before_minutes, 0) AS close_minutes
    INTO v_event
  FROM public.events WHERE id = p_event_id;
  IF NOT FOUND OR v_event.status <> 'published' THEN
    RAISE EXCEPTION 'EVENT_NOT_ON_SALE';
  END IF;
  IF v_event.date IS NOT NULL
     AND now() > v_event.date - make_interval(mins => v_event.close_minutes) THEN
    RAISE EXCEPTION 'SALES_CLOSED';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'qty')::integer;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    -- Réservation atomique : échoue s'il ne reste pas assez de places.
    UPDATE public.ticket_types
       SET sold = coalesce(sold, 0) + v_qty
     WHERE id = (v_item->>'id')::uuid
       AND event_id = p_event_id
       AND coalesce(sold, 0) + v_qty <= quantity
    RETURNING id, name, price INTO v_tt;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOLD_OUT:%', v_item->>'id';
    END IF;

    v_total    := v_total + v_tt.price * v_qty;
    v_quantity := v_quantity + v_qty;
    v_items    := v_items || jsonb_build_object(
      'ticket_type_id', v_tt.id, 'name', v_tt.name, 'qty', v_qty, 'unit_price', v_tt.price);
  END LOOP;

  IF v_quantity > 100 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  UPDATE public.events SET sold = coalesce(sold, 0) + v_quantity WHERE id = p_event_id;

  INSERT INTO public.orders (
    event_id, items, quantity, total_amount, amount_due, payment_mode, provider,
    buyer_name, buyer_email, buyer_phone, contact_method, buyer_location, referral_code, expires_at
  ) VALUES (
    p_event_id, v_items, v_quantity, v_total,
    CASE WHEN p_payment_mode = 'installment' THEN ceil(v_total / 3) ELSE v_total END,
    p_payment_mode, p_provider,
    left(p_buyer->>'name', 200), lower(left(p_buyer->>'email', 320)), left(p_buyer->>'phone', 32),
    left(p_buyer->>'contact_method', 10), p_buyer_location, left(p_referral_code, 64),
    now() + make_interval(mins => greatest(5, least(p_ttl_minutes, 60)))
  )
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- ─── 3. Libération du stock : release_order ───────────────────────────────
CREATE OR REPLACE FUNCTION public.release_order(p_order_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_item  jsonb;
BEGIN
  IF p_status NOT IN ('failed', 'expired') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'pending' THEN
    RETURN false;   -- déjà payée, déjà libérée, ou inconnue
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items) LOOP
    UPDATE public.ticket_types
       SET sold = greatest(coalesce(sold, 0) - (v_item->>'qty')::integer, 0)
     WHERE id = (v_item->>'ticket_type_id')::uuid;
  END LOOP;
  UPDATE public.events SET sold = greatest(coalesce(sold, 0) - v_order.quantity, 0) WHERE id = v_order.event_id;

  UPDATE public.orders SET status = p_status, failure_reason = p_reason WHERE id = p_order_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.orders
    WHERE status = 'pending' AND expires_at < now()
    ORDER BY expires_at
    LIMIT 500
    FOR UPDATE SKIP LOCKED
  LOOP
    IF public.release_order(v_id, 'expired', 'Délai de paiement dépassé') THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ─── 4. Paiement confirmé : finalize_order (idempotent) ───────────────────
CREATE OR REPLACE FUNCTION public.finalize_order(
  p_order_id      uuid,
  p_provider_ref  text,
  p_paid_amount   numeric,
  p_paid_currency text DEFAULT 'XOF'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order       public.orders;
  v_event       record;
  v_item        jsonb;
  v_rate        numeric;
  v_amb_comm    numeric := 0;
  v_tx_id       uuid;
  v_ticket_id   text;
  v_ticket_ids  text[] := '{}';
  v_contact     text;
  i             integer;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Idempotence : déjà finalisée → on renvoie le même résultat.
  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('status', 'paid', 'ticket_ids', to_jsonb(v_order.ticket_ids), 'already', true);
  END IF;
  IF v_order.status NOT IN ('pending', 'expired', 'failed') THEN
    RETURN jsonb_build_object('status', v_order.status);
  END IF;

  -- Le montant encaissé doit couvrir le montant dû, dans la bonne devise.
  IF p_paid_amount IS NULL OR p_paid_amount < v_order.amount_due
     OR upper(coalesce(p_paid_currency, v_order.currency)) <> upper(v_order.currency) THEN
    IF v_order.status = 'pending' THEN
      PERFORM public.release_order(p_order_id, 'failed', 'Montant encaissé insuffisant');
    END IF;
    UPDATE public.orders SET status = 'amount_mismatch', provider_ref = coalesce(p_provider_ref, provider_ref),
           failure_reason = format('Payé %s %s, dû %s %s', p_paid_amount, p_paid_currency, v_order.amount_due, v_order.currency)
     WHERE id = p_order_id;
    RETURN jsonb_build_object('status', 'amount_mismatch');
  END IF;

  -- Paiement arrivé après expiration : on tente de re-réserver le stock.
  IF v_order.status IN ('expired', 'failed') THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items) LOOP
      UPDATE public.ticket_types
         SET sold = coalesce(sold, 0) + (v_item->>'qty')::integer
       WHERE id = (v_item->>'ticket_type_id')::uuid
         AND coalesce(sold, 0) + (v_item->>'qty')::integer <= quantity;
      IF NOT FOUND THEN
        -- Plus de place : le bloc EXCEPTION annule les re-réservations déjà faites.
        RAISE EXCEPTION 'RESTOCK_FAILED';
      END IF;
    END LOOP;
    UPDATE public.events SET sold = coalesce(sold, 0) + v_order.quantity WHERE id = v_order.event_id;
  END IF;

  SELECT id, coalesce(commission_rate, 8.0) AS commission_rate,
         coalesce(ambassador_enabled, false) AS ambassador_enabled,
         ambassador_commission_type, coalesce(ambassador_commission_value, 0) AS ambassador_commission_value
    INTO v_event
  FROM public.events WHERE id = v_order.event_id;

  v_rate := v_event.commission_rate;

  IF v_order.referral_code IS NOT NULL AND v_event.ambassador_enabled THEN
    v_amb_comm := CASE WHEN v_event.ambassador_commission_type = 'percentage'
                       THEN round(v_order.amount_due * v_event.ambassador_commission_value / 100)
                       ELSE v_event.ambassador_commission_value END;
  END IF;

  v_contact := coalesce(nullif(v_order.buyer_email, ''), v_order.buyer_phone);

  INSERT INTO public.transactions (
    event_id, amount, commission_rate, commission_amount, currency, method, status,
    guest_email, buyer_phone, guest_name, buyer_location, referral_code, ambassador_commission,
    order_id, provider_ref
  ) VALUES (
    v_order.event_id, v_order.amount_due, v_rate, round(v_order.amount_due * v_rate / 100), v_order.currency,
    -- Même libellé qu'avant (paystack_card, pawapay_momo, …) pour les tableaux de bord.
    v_order.provider || CASE WHEN v_order.provider = 'paystack' THEN '_card' ELSE '_momo' END,
    'completed',
    v_order.buyer_email, v_order.buyer_phone, coalesce(v_order.buyer_name, 'Guest User'),
    v_order.buyer_location, v_order.referral_code, v_amb_comm,
    v_order.id, p_provider_ref
  )
  RETURNING id INTO v_tx_id;

  -- Un billet par place, identifiant aléatoire non devinable (80 bits).
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items) LOOP
    FOR i IN 1 .. (v_item->>'qty')::integer LOOP
      v_ticket_id := 'TIX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
      INSERT INTO public.tickets (id, event_id, transaction_id, order_id, guest_name, guest_email, status, ticket_type, qr_code)
      VALUES (
        v_ticket_id, v_order.event_id, v_tx_id, v_order.id,
        coalesce(v_order.buyer_name, 'Guest User'), v_contact,
        CASE WHEN v_order.payment_mode = 'full' THEN 'valid' ELSE 'partial' END,
        v_item->>'ticket_type_id', v_ticket_id
      );
      v_ticket_ids := v_ticket_ids || v_ticket_id;
    END LOOP;
  END LOOP;

  IF v_amb_comm > 0 THEN
    BEGIN
      PERFORM public.increment_ambassador_stats(v_order.referral_code, 1, v_amb_comm);
    EXCEPTION WHEN undefined_function THEN
      RAISE WARNING 'increment_ambassador_stats absente : commission ambassadeur non créditée';
    END;
  END IF;

  UPDATE public.orders
     SET status = 'paid', paid_at = now(), provider_ref = coalesce(p_provider_ref, provider_ref),
         transaction_id = v_tx_id, ticket_ids = v_ticket_ids, failure_reason = NULL
   WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'paid', 'ticket_ids', to_jsonb(v_ticket_ids), 'already', false);

EXCEPTION WHEN raise_exception THEN
  IF SQLERRM = 'RESTOCK_FAILED' THEN
    UPDATE public.orders SET status = 'refund_required', provider_ref = coalesce(p_provider_ref, provider_ref),
           failure_reason = 'Paiement reçu après expiration, plus de places disponibles'
     WHERE id = p_order_id;
    RETURN jsonb_build_object('status', 'refund_required');
  END IF;
  RAISE;
END;
$$;

-- ─── 5. Droits : fonctions réservées au serveur ───────────────────────────
REVOKE ALL ON FUNCTION public.create_order(uuid, jsonb, text, text, jsonb, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_order(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_order(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, jsonb, text, text, jsonb, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_order(uuid, text, numeric, text) TO service_role;

-- Les compteurs ne sont plus modifiables depuis le navigateur.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('increment_event_sold', 'increment_ticket_type_sold', 'increment_ambassador_stats')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
    RAISE NOTICE 'EXECUTE retiré au public : %', r.fn;
  END LOOP;
END $$;

-- ─── 6. Plus d'écriture libre sur tickets / transactions ──────────────────
-- Les ventes en ligne passent par finalize_order. Restent autorisés :
--   * l'admin (policy phase0_admin_all) ;
--   * l'organisateur, pour ses billets physiques (PHY-…) et la transaction
--     « cash/pos » associée, sur SES événements uniquement.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('tickets', 'transactions')
      AND cmd = 'INSERT'
      AND coalesce(with_check, '') = 'true'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Policy d''insertion libre supprimée : %.%', r.tablename, r.policyname;
  END LOOP;

  -- Les policies « ALL » ouvertes ne sont pas supprimées ici : le scanner (agents
  -- non authentifiés) en dépend jusqu'à la phase 1b. On les signale.
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('tickets', 'transactions')
      AND cmd = 'ALL' AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true')
  LOOP
    RAISE WARNING 'Policy ALL ouverte encore présente (à traiter en phase 1b) : %.%', r.tablename, r.policyname;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_event_organizer(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND organizer_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_event_organizer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_event_organizer(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS phase1_organizer_physical_tx_insert ON public.transactions;
CREATE POLICY phase1_organizer_physical_tx_insert ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (method = 'cash/pos' AND public.is_event_organizer(event_id));

DROP POLICY IF EXISTS phase1_organizer_physical_tx_delete ON public.transactions;
CREATE POLICY phase1_organizer_physical_tx_delete ON public.transactions
  FOR DELETE TO authenticated
  USING (method = 'cash/pos' AND public.is_event_organizer(event_id));

DROP POLICY IF EXISTS phase1_organizer_physical_tickets_insert ON public.tickets;
CREATE POLICY phase1_organizer_physical_tickets_insert ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (id LIKE 'PHY-%' AND public.is_event_organizer(event_id));

DROP POLICY IF EXISTS phase1_organizer_physical_tickets_delete ON public.tickets;
CREATE POLICY phase1_organizer_physical_tickets_delete ON public.tickets
  FOR DELETE TO authenticated
  USING (id LIKE 'PHY-%' AND public.is_event_organizer(event_id));

COMMIT;

-- ─── Vérifications ─────────────────────────────────────────────────────────
-- 1. Avec la clé anon, ces appels doivent échouer (401/403 ou 0 ligne) :
--   POST /rest/v1/transactions  {"event_id":"…","amount":1,"status":"completed"}
--   POST /rest/v1/rpc/increment_event_sold {"evt_id":"…","amount":-5}
-- 2. Survente : lancer N create_order en parallèle sur un ticket_type de quantité Q :
--   exactement Q places réservées, les suivantes échouent avec SOLD_OUT.
-- 3. Idempotence : appeler deux fois finalize_order sur la même commande →
--   une seule transaction, mêmes ticket_ids (champ "already": true).
