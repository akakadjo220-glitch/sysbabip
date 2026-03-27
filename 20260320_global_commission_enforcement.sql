-- ============================================================
-- Migration: 20260320_global_commission_enforcement.sql
-- Description:
-- Forces the system to use GLOBAL commission rates from platform_settings
-- instead of event-specific commission_rate.
-- ============================================================

-- 1. Ensure global rates are initialized (8% for platform, 2% for physical)
INSERT INTO platform_settings (key, value)
VALUES 
  ('default_commission_rate', '8.0'::jsonb),
  ('default_physical_commission_rate', '2.0'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Update get_admin_stats to use the global digital rate
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS json AS $$
DECLARE
  v_revenue NUMERIC;
  v_commission NUMERIC;
  v_physical_commission NUMERIC;
  v_user_count INT;
  v_active_events INT;
  v_pending_events INT;
  v_global_commission_rate NUMERIC;
BEGIN
  -- Fetch the global digital commission rate
  SELECT (value->>0)::NUMERIC INTO v_global_commission_rate 
  FROM platform_settings WHERE key = 'default_commission_rate';
  v_global_commission_rate := COALESCE(v_global_commission_rate, 8.0);

  -- Revenue & Commission (Digital)
  SELECT 
    COALESCE(SUM(t.amount), 0),
    COALESCE(SUM(t.amount * (v_global_commission_rate / 100.0)), 0)
  INTO v_revenue, v_commission
  FROM transactions t
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

-- 3. Update get_org_stats to use global platform rate
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
BEGIN
  -- Fetch the global digital commission rate
  SELECT (value->>0)::NUMERIC INTO v_global_commission_rate 
  FROM platform_settings WHERE key = 'default_commission_rate';
  v_global_commission_rate := COALESCE(v_global_commission_rate, 8.0);

  -- Gross & Commission
  SELECT 
    COALESCE(SUM(t.amount), 0),
    COALESCE(SUM(t.amount * (v_global_commission_rate / 100.0)), 0)
  INTO v_gross, v_commission
  FROM transactions t
  JOIN events e ON t.event_id = e.id
  WHERE t.status = 'completed' AND e.organizer_id = p_organizer_id;

  v_net := v_gross - v_commission;

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
    'physicalCount', v_physical_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-create views to ignore per-event commission_rate
-- (We use the current default_commission_rate for calculation)
CREATE OR REPLACE VIEW admin_event_payouts_view AS
WITH global_config AS (
  SELECT (value->>0)::NUMERIC as digital_rate 
  FROM platform_settings WHERE key = 'default_commission_rate'
),
event_rev AS (
  SELECT 
    e.id AS event_id,
    e.title AS event_title,
    COALESCE(e.organizer_name, 'Organisateur') AS organizer_name,
    e.date AS event_date,
    COALESCE(SUM(t.amount), 0) AS revenue
  FROM events e
  LEFT JOIN transactions t ON t.event_id = e.id AND t.status = 'completed'
  GROUP BY e.id, e.title, e.organizer_name, e.date
),
event_advances AS (
  SELECT 
    event_id,
    COALESCE(SUM(amount), 0) AS advance_deducted
  FROM payout_requests
  WHERE status IN ('paid', 'approved', 'pending')
    AND type IN ('cash_advance', 'physical_commission')
  GROUP BY event_id
)
SELECT 
  er.event_id,
  er.event_title,
  er.organizer_name,
  er.event_date,
  er.revenue,
  (er.revenue * (COALESCE((SELECT digital_rate FROM global_config), 8.0) / 100.0)) AS commission,
  COALESCE(ea.advance_deducted, 0) AS advance_deducted,
  (er.revenue * (1 - (COALESCE((SELECT digital_rate FROM global_config), 8.0) / 100.0))) - COALESCE(ea.advance_deducted, 0) AS payout_amount
FROM event_rev er
LEFT JOIN event_advances ea ON er.event_id = ea.event_id;

-- org_event_sales_view
CREATE OR REPLACE VIEW org_event_sales_view AS
WITH global_config AS (
  SELECT (value->>0)::NUMERIC as digital_rate 
  FROM platform_settings WHERE key = 'default_commission_rate'
),
event_rev AS (
  SELECT 
    e.id AS event_id,
    e.organizer_id,
    e.title,
    e.date,
    e.status as evt_status,
    COALESCE(e.advance_rate, 30.0) AS adv_rate,
    COUNT(t.id) AS tickets_sold,
    COALESCE(SUM(t.amount), 0) AS gross
  FROM events e
  LEFT JOIN transactions t ON t.event_id = e.id AND t.status = 'completed'
  GROUP BY e.id, e.organizer_id, e.title, e.date, e.status, e.advance_rate
),
event_advances AS (
  SELECT DISTINCT ON (event_id)
    event_id,
    status AS advance_status,
    amount AS advance_amt
  FROM payout_requests
  WHERE type = 'cash_advance'
  ORDER BY event_id, created_at DESC
)
SELECT 
  er.event_id,
  er.organizer_id,
  er.title,
  er.date,
  er.evt_status,
  er.gross,
  COALESCE((SELECT digital_rate FROM global_config), 8.0) AS comm_rate,
  er.adv_rate,
  (er.gross * (COALESCE((SELECT digital_rate FROM global_config), 8.0) / 100.0)) AS comm,
  (er.gross * (1 - (COALESCE((SELECT digital_rate FROM global_config), 8.0) / 100.0))) AS base_net,
  er.tickets_sold,
  CASE WHEN (er.gross * (1 - (COALESCE((SELECT digital_rate FROM global_config), 8.0) / 100.0))) > 50000 THEN 'En attente' ELSE 'Transféré' END AS payout_status,
  COALESCE(ea.advance_amt, 0) AS advance_amt,
  ea.advance_status,
  (er.gross * (er.adv_rate / 100.0)) AS max_advance,
  (er.gross * (1 - (COALESCE((SELECT digital_rate FROM global_config), 8.0) / 100.0))) - CASE WHEN ea.advance_status IN ('paid', 'approved', 'pending') THEN ea.advance_amt ELSE 0 END AS remaining_payout
FROM event_rev er
LEFT JOIN event_advances ea ON er.event_id = ea.event_id;
