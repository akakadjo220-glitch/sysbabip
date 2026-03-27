-- ============================================================
-- Migration: 20260319_automated_physical_commissions.sql
-- Description:
-- 1. Adds physical_commission_rate to events and platform_settings
-- 2. Creates RPC to confirm manual MoMo payments for physical tickets
-- 3. Updates pay_physical_commission to accept these payment tokens
-- 4. Updates get_admin_stats to include physical commissions
-- ============================================================

-- 1. Ajouter les colonnes manquantes et étendre les ENUMs
ALTER TABLE events ADD COLUMN IF NOT EXISTS physical_commission_rate NUMERIC;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS notes TEXT; -- Fallback si absent

-- On s'assure que l'ENUM payout_status accepte les nouveaux statuts
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'payout_status' AND e.enumlabel = 'pending_payment') THEN
    ALTER TYPE payout_status ADD VALUE 'pending_payment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'payout_status' AND e.enumlabel = 'approved_for_print') THEN
    ALTER TYPE payout_status ADD VALUE 'approved_for_print';
  END IF;
END $$;

-- Mettre à jour les événements existants pour qu'ils héritent du commission_rate s'il existe
UPDATE events 
SET physical_commission_rate = commission_rate 
WHERE physical_commission_rate IS NULL;

-- 2. Ajouter la clé par défaut dans platform_settings (ex: 2%)
INSERT INTO platform_settings (key, value)
VALUES ('default_physical_commission_rate', '2.0'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Créer le RPC de confirmation de paiement manuel par l'organisateur
CREATE OR REPLACE FUNCTION confirm_physical_commission_payment(
  p_organizer_id UUID,
  p_event_id UUID,
  p_amount NUMERIC,
  p_reference TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insère une demande considérée comme "payée" directement, 
  -- sous un type spécifique pour ne pas la déduire du solde wallet de l'organisateur
  -- (car il a payé de sa poche / carte bancaire / Mobile Money hors wallet)
  INSERT INTO payout_requests (
    organizer_id,
    event_id,
    amount,
    type,
    status,
    notes,
    resolved_at,
    reference
  ) VALUES (
    p_organizer_id,
    p_event_id,
    p_amount,
    'direct_physical_commission',
    'approved_for_print',
    'Paiement direct (Ref: ' || p_reference || ')',
    NOW(),
    p_reference
  );

  RETURN json_build_object('success', true);
END;
$$;

-- 4. Mettre à jour le RPC pay_physical_commission pour l'accepter
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

  -- 3a. Vérifier si l'organisateur a un "Passe-droit" (Admin a validé le paiement OU Paiement Direct MoMo)
  SELECT id INTO v_existing
  FROM payout_requests
  WHERE organizer_id = p_organizer_id
    AND event_id     = p_event_id
    AND type         IN ('physical_commission', 'direct_physical_commission')
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

  -- 3b. Section Removed: We no longer check or enforce pending_payment requests 
  --     because we no longer create them. This prevents phantom debt records.

  -- 4. Si pas de demande en cours, on vérifie si le solde permet de prélever auto
  IF v_available_balance >= v_commission THEN
    -- Prélèvement immédiat depuis le wallet digital
    INSERT INTO payout_requests (organizer_id, event_id, amount, status, type, notes, resolved_at)
    VALUES (p_organizer_id, p_event_id, v_commission, 'paid', 'physical_commission', 'Prélèvement auto', NOW());

    RETURN json_build_object(
      'success', true,
      'method',  'wallet_deduction',
      'amount',  v_commission,
      'balance_before', v_available_balance,
      'balance_after',  v_available_balance - v_commission
    );
  ELSE
    -- 5. Solde insuffisant : On retourne une erreur simple, sans polluer la table payout_requests
    RETURN json_build_object(
      'success', false,
      'reason',  'insufficient_balance',
      'amount',  v_commission,
      'balance', v_available_balance,
      'request_id', NULL
    );
  END IF;

END;
$$;

-- 5. Mettre à jour get_admin_stats pour inclure les commissions physiques
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS json AS $$
DECLARE
  v_revenue NUMERIC;
  v_commission NUMERIC;
  v_physical_commission NUMERIC;
  v_user_count INT;
  v_active_events INT;
  v_pending_events INT;
BEGIN
  -- Revenue & Commission (Digital)
  SELECT 
    COALESCE(SUM(t.amount), 0),
    COALESCE(SUM(t.amount * (COALESCE(e.commission_rate, 8.0) / 100.0)), 0)
  INTO v_revenue, v_commission
  FROM transactions t
  JOIN events e ON t.event_id = e.id
  WHERE t.status = 'completed';

  -- Commission (Physique)
  SELECT COALESCE(SUM(amount), 0) INTO v_physical_commission
  FROM payout_requests
  WHERE type IN ('physical_commission', 'direct_physical_commission')
    AND status = 'paid';

  -- User Count
  SELECT count(*) INTO v_user_count FROM profiles;

  -- Events (Active / Pending)
  SELECT count(*) INTO v_active_events FROM events WHERE status = 'published';
  SELECT count(*) INTO v_pending_events FROM events WHERE status = 'pending_review';

  RETURN json_build_object(
    'revenue', v_revenue,
    'commission', v_commission,
    'physicalCommission', v_physical_commission,
    'paidPayouts', v_revenue - v_commission,
    'userCount', v_user_count,
    'activeEvents', v_active_events,
    'pendingEvents', v_pending_events
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
