-- ============================================================
-- Migration: 20260319_physical_commission.sql
-- Commission sur billets physiques :
--   - Option 1 : déduction auto depuis le wallet (solde suffisant)
--   - Option 2 : demande de paiement si solde insuffisant
-- ============================================================

-- 1. Ajouter les colonnes de suivi de commission physique
ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Expand ENUMs to accept the new values
ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'pending_payment';
ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'approved_for_print';

-- 3. Créer le RPC pay_physical_commission
CREATE OR REPLACE FUNCTION pay_physical_commission(
  p_organizer_id   UUID,
  p_event_id       UUID,
  p_quantity       INT,
  p_ticket_price   NUMERIC,
  p_commission_rate NUMERIC DEFAULT 0.08
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_commission     NUMERIC;
  v_available_balance NUMERIC;
  v_existing       UUID;
BEGIN
  -- 1. Calculer la commission due
  v_commission := ROUND(p_quantity * p_ticket_price * p_commission_rate, 0);

  IF v_commission <= 0 THEN
    -- Free event — no commission needed, just allow
    RETURN json_build_object(
      'success', true,
      'method',  'free_event',
      'amount',  0
    );
  END IF;

  -- 2. Calcul du solde wallet disponible de l'organisateur
  --    (total net de toutes ses ventes digitales moins avances déjà versées)
  SELECT COALESCE(SUM(base_net), 0)
  INTO v_available_balance
  FROM org_event_sales_view
  WHERE organizer_id = p_organizer_id;

  -- Déduire les avances déjà payées
  SELECT v_available_balance - COALESCE(SUM(amount), 0)
  INTO v_available_balance
  FROM payout_requests
  WHERE organizer_id = p_organizer_id
    AND type = 'cash_advance'
    AND status = 'paid';

  -- Déduire les commissions physiques déjà prélevées
  SELECT v_available_balance - COALESCE(SUM(amount), 0)
  INTO v_available_balance
  FROM payout_requests
  WHERE organizer_id = p_organizer_id
    AND type = 'physical_commission'
    AND status = 'paid';

  -- 3a. Vérifier si l'organisateur a un "Passe-droit" (Admin a validé le paiement)
  SELECT id INTO v_existing
  FROM payout_requests
  WHERE organizer_id = p_organizer_id
    AND event_id     = p_event_id
    AND type         = 'physical_commission'
    AND status       = 'approved_for_print'
    AND amount       = v_commission
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- On consomme le passe-droit pour imprimer cette tournée de billets
    UPDATE payout_requests
    SET status = 'paid',
        notes = COALESCE(notes, '') || ' (Billets imprimés avec succès)'
    WHERE id = v_existing;

    RETURN json_build_object(
      'success', true,
      'method',  'pre_approved_token',
      'amount',  v_commission,
      'request_id', v_existing
    );
  END IF;

  -- 3b. Vérifier si une demande pending_payment existe déjà pour cet event
  SELECT id INTO v_existing
  FROM payout_requests
  WHERE organizer_id = p_organizer_id
    AND event_id     = p_event_id
    AND type         = 'physical_commission'
    AND status       = 'pending_payment'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Il y a déjà une demande non payée
    RETURN json_build_object(
      'success',  false,
      'reason',   'pending_payment_exists',
      'amount',   v_commission,
      'balance',  v_available_balance,
      'request_id', v_existing
    );
  END IF;

  -- 4a. Solde suffisant → déduction automatique (status = paid)
  IF v_available_balance >= v_commission THEN
    INSERT INTO payout_requests (organizer_id, event_id, amount, type, status, notes)
    VALUES (
      p_organizer_id,
      p_event_id,
      v_commission,
      'physical_commission',
      'paid',
      'Commission automatiquement déduite du wallet Babipass — ' || p_quantity || ' billets physiques à ' || p_ticket_price || ' FCFA'
    );

    RETURN json_build_object(
      'success', true,
      'method',  'wallet_deduction',
      'amount',  v_commission,
      'balance_after', v_available_balance - v_commission
    );

  -- 4b. Solde insuffisant → demande de paiement externe
  ELSE
    INSERT INTO payout_requests (organizer_id, event_id, amount, type, status, notes)
    VALUES (
      p_organizer_id,
      p_event_id,
      v_commission,
      'physical_commission',
      'pending_payment',
      'Paiement requis avant impression — ' || p_quantity || ' billets physiques à ' || p_ticket_price || ' FCFA (solde wallet : ' || v_available_balance || ' FCFA)'
    );

    RETURN json_build_object(
      'success', false,
      'reason',  'insufficient_balance',
      'amount',  v_commission,
      'balance', v_available_balance
    );
  END IF;
END;
$$;

-- 4. Politique RLS : l'organisateur peut lire ses propres payout_requests physical_commission
-- (La politique générale existante devrait déjà couvrir ça, mais on s'assure)
-- Si la table n'a pas de politique "organizer can read own rows", en ajouter une :
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payout_requests'
      AND policyname = 'Organizers can view own payout requests'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Organizers can view own payout requests"
      ON payout_requests FOR SELECT
      TO authenticated
      USING (organizer_id = auth.uid());
    $pol$;
  END IF;
END $$;
