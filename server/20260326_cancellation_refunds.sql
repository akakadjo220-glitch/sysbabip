-- Migration: Add Cancellation and Refund Tracking
-- Adds columns to events and transactions to track refund requests and processing

ALTER TABLE "public"."events"
ADD COLUMN IF NOT EXISTS "cancellation_status" text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "cancellation_reason" text;

ALTER TABLE "public"."transactions"
ADD COLUMN IF NOT EXISTS "refund_status" text DEFAULT 'none';

-- Create an index to quickly find pending refunds
CREATE INDEX IF NOT EXISTS "idx_transactions_refund_status" ON "public"."transactions" ("refund_status");
CREATE INDEX IF NOT EXISTS "idx_events_cancellation_status" ON "public"."events" ("cancellation_status");

-- RPC: Approve Event Cancellation and mark transactions for refund
CREATE OR REPLACE FUNCTION approve_event_cancellation(p_event_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_user_id uuid;
    v_user_role text;
BEGIN
    -- Verify admin role
    v_admin_user_id := auth.uid();
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié';
    END IF;

    SELECT role INTO v_user_role FROM profiles WHERE id = v_admin_user_id;
    IF v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Accès refusé. Réservé aux administrateurs.';
    END IF;

    -- Update event status
    UPDATE events
    SET cancellation_status = 'approved'
    WHERE id = p_event_id;

    -- Mark eligible transactions for refund
    UPDATE transactions
    SET refund_status = 'pending'
    WHERE item_id = p_event_id 
      AND item_type = 'event'
      AND status = 'success'
      AND amount > 0;

    RETURN json_build_object('success', true, 'message', 'Annulation approuvée et remboursements marqués "en attente"');
END;
$$;
