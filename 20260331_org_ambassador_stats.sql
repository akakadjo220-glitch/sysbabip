-- ============================================================
-- Migration: 20260331_org_ambassador_stats.sql
-- Description:
-- Updates get_org_stats to subtract ambassador commissions from organizers' net profit,
-- and exposes total_ambassador_commission for the UI.
-- ============================================================

CREATE OR REPLACE FUNCTION get_org_stats(p_organizer_id UUID)
RETURNS json AS $$
DECLARE
  v_gross NUMERIC;
  v_commission NUMERIC;
  v_net NUMERIC;
  v_advances NUMERIC;
  v_balance NUMERIC;
  v_physical_commission_paid NUMERIC;
  v_physical_count BIGINT;
  v_global_commission_rate NUMERIC;
  v_ambassador_commission NUMERIC;
BEGIN
  -- Fetch the global digital commission rate
  SELECT (value->>0)::NUMERIC INTO v_global_commission_rate 
  FROM platform_settings WHERE key = 'default_commission_rate';
  v_global_commission_rate := COALESCE(v_global_commission_rate, 8.0);

  -- Gross, Platform Commission, and Ambassador Commission
  SELECT 
    COALESCE(SUM(t.amount), 0),
    COALESCE(SUM(t.amount * (v_global_commission_rate / 100.0)), 0),
    COALESCE(SUM(t.ambassador_commission), 0)
  INTO v_gross, v_commission, v_ambassador_commission
  FROM transactions t
  JOIN events e ON t.event_id = e.id
  WHERE t.status = 'completed' AND e.organizer_id = p_organizer_id;

  -- The Net profit now subtracts the Ambassador commission because the organizer pays for it.
  v_net := v_gross - v_commission - v_ambassador_commission;

  -- Logic balance
  SELECT COALESCE(SUM(amount), 0) INTO v_advances
  FROM payout_requests 
  WHERE organizer_id = p_organizer_id AND status IN ('paid', 'approved', 'pending');

  v_balance := v_net - v_advances;

  -- Commissions physiques payées 
  SELECT COALESCE(SUM(amount), 0) INTO v_physical_commission_paid
  FROM payout_requests 
  WHERE organizer_id = p_organizer_id 
    AND type IN ('physical_commission', 'direct_physical_commission')
    AND status IN ('paid', 'approved_for_print');

  -- Nombre total de billets physiques générés
  SELECT COUNT(id) INTO v_physical_count
  FROM tickets
  WHERE event_id IN (SELECT id FROM events WHERE organizer_id = p_organizer_id)
    AND guest_name = 'Billet Physique (Revendeur)';

  RETURN json_build_object(
    'totalGross', v_gross,
    'totalNet', v_net,
    'totalCommission', v_commission,
    'availableBalance', GREATEST(v_balance, 0),
    'physicalCommissionPaid', v_physical_commission_paid,
    'physicalCount', v_physical_count,
    'totalAmbassador', v_ambassador_commission
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
