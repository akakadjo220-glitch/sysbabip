-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1c — Dons, paiement fractionné, billets physiques côté serveur
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : phases 0, 1a, 1b appliquées.
-- Ordre de déploiement : serveur → site → CE script.
--
-- La table orders devient générique (colonne kind) :
--   tickets             : achat de billets (phase 1a)
--   donation            : contribution à une levée de fonds
--   installment         : tranche d'un achat en paiement fractionné
--   physical_commission : commission due avant impression de billets physiques
-- Tous passent par la même vérification de paiement côté serveur et par
-- finalize_order, qui applique l'effet propre à chaque type.
--
-- Billets physiques : générés uniquement par create_physical_batch (prix et
-- taux lus en base, quota gratuit et commission contrôlés), plus par le
-- navigateur de l'organisateur.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Commandes génériques ──────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'tickets';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES public.orders(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS campaign_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS organizer_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.orders ALTER COLUMN event_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_kind') THEN
    ALTER TABLE public.orders ADD CONSTRAINT chk_orders_kind
      CHECK (kind IN ('tickets', 'donation', 'installment', 'physical_commission'));
  END IF;
  -- Les commandes non-billets n'ont pas de places : quantity peut valoir 0.
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_quantity_check;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_quantity') THEN
    ALTER TABLE public.orders ADD CONSTRAINT chk_orders_quantity CHECK (quantity >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_parent ON public.orders(parent_order_id) WHERE parent_order_id IS NOT NULL;

-- Montant déjà encaissé des achats de billets déjà payés.
UPDATE public.orders SET amount_paid = amount_due WHERE kind = 'tickets' AND status = 'paid' AND amount_paid = 0;

-- Lecture d'un réglage numérique (jsonb nombre ou texte).
CREATE OR REPLACE FUNCTION public.setting_numeric(p_key text, p_default numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT nullif(value #>> '{}', '')::numeric FROM public.platform_settings WHERE key = p_key), p_default);
$$;

-- Insertion commune d'une commande non-billets.
CREATE OR REPLACE FUNCTION public.insert_payment_order(
  p_kind text, p_amount numeric, p_provider text, p_buyer jsonb,
  p_event_id uuid DEFAULT NULL, p_campaign_id uuid DEFAULT NULL,
  p_parent_order_id uuid DEFAULT NULL, p_organizer_id uuid DEFAULT NULL, p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  INSERT INTO public.orders (
    kind, event_id, campaign_id, parent_order_id, organizer_id, items, quantity,
    total_amount, amount_due, provider, buyer_name, buyer_email, buyer_phone, contact_method, meta
  ) VALUES (
    p_kind, p_event_id, p_campaign_id, p_parent_order_id, p_organizer_id, '[]'::jsonb, 0,
    p_amount, p_amount, p_provider,
    left(p_buyer->>'name', 200), lower(left(p_buyer->>'email', 320)), left(p_buyer->>'phone', 32),
    left(p_buyer->>'contact_method', 10), coalesce(p_meta, '{}'::jsonb)
  )
  RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;

-- ─── 2. Dons ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_donation_order(
  p_campaign_id uuid, p_amount numeric, p_provider text, p_buyer jsonb
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fundraising_campaigns WHERE id = p_campaign_id AND status::text = 'active') THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_ACTIVE';
  END IF;
  IF p_amount IS NULL OR p_amount < 100 OR p_amount > 50000000 OR p_amount <> round(p_amount) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  RETURN public.insert_payment_order('donation', p_amount, p_provider, p_buyer, NULL, p_campaign_id);
END;
$$;

-- ─── 3. Paiement fractionné ───────────────────────────────────────────────
-- Le détenteur d'un billet « partial » règle la tranche suivante. La dernière
-- tranche couvre exactement le reste dû.
CREATE OR REPLACE FUNCTION public.create_installment_order(p_ticket_id text, p_provider text, p_buyer jsonb)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent  public.orders;
  v_ticket  public.tickets;
  v_tranche numeric(12,2);
  v_buyer   jsonb;
BEGIN
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id;
  IF NOT FOUND OR v_ticket.order_id IS NULL OR v_ticket.status <> 'partial' THEN
    RAISE EXCEPTION 'NOTHING_TO_PAY';
  END IF;
  SELECT * INTO v_parent FROM public.orders WHERE id = v_ticket.order_id;
  IF NOT FOUND OR v_parent.payment_mode <> 'installment' OR v_parent.status <> 'paid'
     OR v_parent.amount_paid >= v_parent.total_amount THEN
    RAISE EXCEPTION 'NOTHING_TO_PAY';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE parent_order_id = v_parent.id AND status = 'pending' AND expires_at > now()) THEN
    RAISE EXCEPTION 'INSTALLMENT_PENDING';
  END IF;

  v_tranche := least(ceil(v_parent.total_amount / 3), v_parent.total_amount - v_parent.amount_paid);
  v_buyer := jsonb_build_object(
    'name', v_parent.buyer_name, 'email', v_parent.buyer_email,
    'phone', v_parent.buyer_phone, 'contact_method', v_parent.contact_method) || coalesce(p_buyer, '{}'::jsonb);

  RETURN public.insert_payment_order('installment', v_tranche, p_provider, v_buyer, v_parent.event_id, NULL, v_parent.id);
END;
$$;

-- ─── 4. Billets physiques ─────────────────────────────────────────────────
-- Devis calculé en base : prix de la catégorie, taux et quota gratuit.
CREATE OR REPLACE FUNCTION public.physical_batch_quote(
  p_organizer_id uuid, p_event_id uuid, p_category_id text, p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event     record;
  v_price     numeric;
  v_name      text;
  v_rate      numeric;
  v_max       integer;
  v_free_left integer;
  v_free      integer;
  v_billable  integer;
BEGIN
  SELECT id, organizer_id, coalesce(price, 0) AS price INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND OR v_event.organizer_id IS DISTINCT FROM p_organizer_id THEN
    RAISE EXCEPTION 'NOT_EVENT_ORGANIZER';
  END IF;

  v_max := public.setting_numeric('max_physical_tickets_per_batch', 5000)::integer;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > v_max THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  SELECT name, price INTO v_name, v_price FROM public.ticket_types
  WHERE id::text = p_category_id AND event_id = p_event_id;
  IF NOT FOUND THEN
    -- Événement sans catégories : catégories par défaut au prix de l'événement.
    IF p_category_id NOT IN ('cat-std', 'cat-vip') OR EXISTS (SELECT 1 FROM public.ticket_types WHERE event_id = p_event_id) THEN
      RAISE EXCEPTION 'INVALID_CATEGORY';
    END IF;
    v_name := CASE p_category_id WHEN 'cat-vip' THEN 'VIP PASS' ELSE 'Standard PASS' END;
    v_price := v_event.price;
  END IF;

  v_rate := public.setting_numeric('default_physical_commission_rate', 8);
  IF v_rate > 1 THEN v_rate := v_rate / 100; END IF;

  SELECT greatest(coalesce(free_physical_tickets_granted, 0) - coalesce(free_physical_tickets_used, 0), 0)
    INTO v_free_left FROM public.profiles WHERE id = p_organizer_id;
  v_free := least(p_quantity, coalesce(v_free_left, 0));
  v_billable := p_quantity - v_free;

  RETURN jsonb_build_object(
    'category_name', v_name, 'unit_price', v_price, 'rate', v_rate,
    'quantity', p_quantity, 'free_quantity', v_free, 'billable_quantity', v_billable,
    'commission', round(v_billable * coalesce(v_price, 0) * v_rate, 0), 'max_batch', v_max);
END;
$$;

-- Commande de paiement direct de la commission (quand le wallet ne suffit pas).
CREATE OR REPLACE FUNCTION public.create_physical_commission_order(
  p_organizer_id uuid, p_event_id uuid, p_category_id text, p_quantity integer, p_provider text, p_buyer jsonb
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote jsonb := public.physical_batch_quote(p_organizer_id, p_event_id, p_category_id, p_quantity);
BEGIN
  IF (v_quote->>'commission')::numeric <= 0 THEN
    RAISE EXCEPTION 'NOTHING_TO_PAY';
  END IF;
  RETURN public.insert_payment_order('physical_commission', (v_quote->>'commission')::numeric, p_provider, p_buyer,
    p_event_id, NULL, NULL, p_organizer_id, v_quote);
END;
$$;

-- Génération d'un lot : commission réglée (gratuit, jeton pré-payé ou wallet),
-- puis transaction « cash/pos » et billets PHY- à identifiant aléatoire.
CREATE OR REPLACE FUNCTION public.create_physical_batch(
  p_organizer_id uuid, p_event_id uuid, p_category_id text, p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote    jsonb;
  v_comm     numeric;
  v_method   text := 'free';
  v_payment  json;
  v_tx_id    uuid;
  v_ids      text[];
  v_email    text;
  v_currency text;
BEGIN
  -- Un seul lot à la fois par organisateur (évite de consommer deux fois le quota gratuit).
  PERFORM pg_advisory_xact_lock(hashtextextended('physical-batch:' || p_organizer_id::text, 0));

  v_quote := public.physical_batch_quote(p_organizer_id, p_event_id, p_category_id, p_quantity);
  v_comm := (v_quote->>'commission')::numeric;

  IF v_comm > 0 THEN
    -- Logique existante : consomme un jeton pré-payé du bon montant, sinon prélève le wallet.
    v_payment := public.pay_physical_commission(
      p_organizer_id, p_event_id, (v_quote->>'billable_quantity')::integer,
      (v_quote->>'unit_price')::numeric, (v_quote->>'rate')::numeric);
    IF coalesce((v_payment->>'success')::boolean, false) = false THEN
      RETURN jsonb_build_object('status', 'payment_required', 'quote', v_quote,
                                'balance', v_payment->'balance');
    END IF;
    v_method := v_payment->>'method';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = p_organizer_id;
  SELECT currency INTO v_currency FROM public.events WHERE id = p_event_id;

  INSERT INTO public.transactions (event_id, user_id, amount, commission_rate, commission_amount, currency, status, method, guest_name, guest_email)
  VALUES (p_event_id, p_organizer_id, v_comm, round((v_quote->>'rate')::numeric * 100, 2), v_comm, coalesce(v_currency, 'XOF'),
          'valid', 'cash/pos', format('Lot de %s Billets Physiques', p_quantity), coalesce(v_email, 'organizer@local.com'))
  RETURNING id INTO v_tx_id;

  WITH new_tickets AS (
    INSERT INTO public.tickets (id, event_id, transaction_id, status, guest_name, guest_email, ticket_type, qr_code)
    SELECT t.id, p_event_id, v_tx_id, 'valid', 'Billet Physique (Revendeur)', coalesce(v_email, 'organizer@local.com'),
           v_quote->>'category_name', t.id
    FROM (
      SELECT 'PHY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)) AS id
      FROM generate_series(1, p_quantity)
    ) t
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM new_tickets;

  IF (v_quote->>'free_quantity')::integer > 0 THEN
    UPDATE public.profiles
       SET free_physical_tickets_used = coalesce(free_physical_tickets_used, 0) + (v_quote->>'free_quantity')::integer
     WHERE id = p_organizer_id;
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'method', v_method, 'quote', v_quote,
                            'transaction_id', v_tx_id, 'ticket_ids', to_jsonb(v_ids));
END;
$$;

-- ─── 5. finalize_order : effets propres à chaque type ─────────────────────
-- La version « billets » de la phase 1a est renommée ; finalize_order aiguille.
DO $$
BEGIN
  IF to_regprocedure('public.finalize_ticket_order(uuid, text, numeric, text)') IS NULL THEN
    ALTER FUNCTION public.finalize_order(uuid, text, numeric, text) RENAME TO finalize_ticket_order;
  END IF;
END $$;

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
  v_order      public.orders;
  v_parent     public.orders;
  v_rate       numeric;
  v_fee        numeric;
  v_ticket_ids text[];
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.kind = 'tickets' THEN
    RETURN public.finalize_ticket_order(p_order_id, p_provider_ref, p_paid_amount, p_paid_currency)
           || jsonb_build_object('kind', 'tickets');
  END IF;

  -- Types sans stock : idempotence et contrôle du montant.
  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('status', 'paid', 'kind', v_order.kind, 'already', true);
  END IF;
  IF v_order.status NOT IN ('pending', 'expired', 'failed') THEN
    RETURN jsonb_build_object('status', v_order.status, 'kind', v_order.kind);
  END IF;
  IF p_paid_amount IS NULL OR p_paid_amount < v_order.amount_due
     OR upper(coalesce(p_paid_currency, v_order.currency)) <> upper(v_order.currency) THEN
    UPDATE public.orders SET status = 'amount_mismatch', provider_ref = coalesce(p_provider_ref, provider_ref),
           failure_reason = format('Payé %s %s, dû %s %s', p_paid_amount, p_paid_currency, v_order.amount_due, v_order.currency)
     WHERE id = p_order_id;
    RETURN jsonb_build_object('status', 'amount_mismatch', 'kind', v_order.kind);
  END IF;

  IF v_order.kind = 'donation' THEN
    v_rate := public.setting_numeric('default_fundraising_commission_rate', 5) / 100;
    v_fee := round(v_order.amount_due * v_rate);
    INSERT INTO public.fundraising_contributions (
      campaign_id, contributor_name, contributor_email, amount, platform_fee, net_amount, payment_method, transaction_ref)
    VALUES (v_order.campaign_id, coalesce(v_order.buyer_name, 'Anonyme'), v_order.buyer_email,
            v_order.amount_due, v_fee, v_order.amount_due - v_fee, v_order.provider, coalesce(p_provider_ref, v_order.id::text));

  ELSIF v_order.kind = 'installment' THEN
    SELECT * INTO v_parent FROM public.orders WHERE id = v_order.parent_order_id FOR UPDATE;
    INSERT INTO public.transactions (
      event_id, amount, commission_rate, commission_amount, currency, method, status,
      guest_email, buyer_phone, guest_name, order_id, provider_ref)
    SELECT v_parent.event_id, v_order.amount_due, coalesce(e.commission_rate, 8.0),
           round(v_order.amount_due * coalesce(e.commission_rate, 8.0) / 100), v_order.currency,
           v_order.provider || CASE WHEN v_order.provider = 'paystack' THEN '_card' ELSE '_momo' END, 'completed',
           v_parent.buyer_email, v_parent.buyer_phone, coalesce(v_parent.buyer_name, 'Guest User'), v_order.id, p_provider_ref
    FROM public.events e WHERE e.id = v_parent.event_id;

    UPDATE public.orders SET amount_paid = amount_paid + v_order.amount_due WHERE id = v_parent.id
    RETURNING * INTO v_parent;

    -- Totalité réglée : les billets deviennent valables à l'entrée.
    IF v_parent.amount_paid >= v_parent.total_amount THEN
      UPDATE public.tickets SET status = 'valid' WHERE order_id = v_parent.id AND status = 'partial';
    END IF;
    v_ticket_ids := v_parent.ticket_ids;

  ELSIF v_order.kind = 'physical_commission' THEN
    -- Jeton consommé par create_physical_batch (même montant, même événement).
    INSERT INTO public.payout_requests (organizer_id, event_id, amount, type, status, notes, resolved_at, reference)
    VALUES (v_order.organizer_id, v_order.event_id, v_order.amount_due, 'direct_physical_commission',
            'approved_for_print', 'Paiement direct vérifié (commande ' || v_order.id || ')', now(), coalesce(p_provider_ref, v_order.id::text));
  END IF;

  UPDATE public.orders
     SET status = 'paid', paid_at = now(), amount_paid = amount_due,
         provider_ref = coalesce(p_provider_ref, provider_ref), failure_reason = NULL
   WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'paid', 'kind', v_order.kind, 'already', false,
                            'ticket_ids', to_jsonb(v_ticket_ids),
                            'fully_paid', v_order.kind <> 'installment' OR v_parent.amount_paid >= v_parent.total_amount);
END;
$$;

-- Un achat de billets payé enregistre son montant encaissé (1re tranche ou totalité).
CREATE OR REPLACE FUNCTION public.sync_ticket_order_amount_paid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.kind = 'tickets' AND NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.amount_paid = 0 THEN
    NEW.amount_paid := NEW.amount_due;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_orders_amount_paid ON public.orders;
CREATE TRIGGER trg_orders_amount_paid BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_ticket_order_amount_paid();

-- ─── 6. Droits ────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('setting_numeric', 'insert_payment_order', 'create_donation_order', 'create_installment_order',
                        'physical_batch_quote', 'create_physical_commission_order', 'create_physical_batch',
                        'finalize_order', 'finalize_ticket_order',
                        'pay_physical_commission', 'confirm_physical_commission_payment')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;
END $$;

-- ─── 7. Plus d'écriture directe pour les billets physiques et les dons ────
DROP POLICY IF EXISTS phase1_organizer_physical_tx_insert ON public.transactions;
DROP POLICY IF EXISTS phase1_organizer_physical_tx_delete ON public.transactions;
DROP POLICY IF EXISTS phase1_organizer_physical_tickets_insert ON public.tickets;
DROP POLICY IF EXISTS phase1_organizer_physical_tickets_delete ON public.tickets;

DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.fundraising_contributions') IS NOT NULL THEN
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'fundraising_contributions'
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
        AND (coalesce(with_check, '') = 'true' OR coalesce(qual, '') = 'true')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.fundraising_contributions', r.policyname);
      RAISE NOTICE 'Policy ouverte supprimée : fundraising_contributions.%', r.policyname;
    END LOOP;
  END IF;
END $$;

COMMIT;

-- ─── Vérifications ─────────────────────────────────────────────────────────
-- 1. Avec la clé anon : POST /rest/v1/fundraising_contributions → refusé.
-- 2. Organisateur connecté : POST /rest/v1/tickets {"id":"PHY-x",...} → refusé.
-- 3. POST /rest/v1/rpc/confirm_physical_commission_payment → permission denied.
