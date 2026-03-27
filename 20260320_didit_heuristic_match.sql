-- ============================================================
-- Migration: 20260320_didit_heuristic_match.sql
-- Description:
-- Creates a secure RPC to heuristically find and verify a pending 
-- organizer when the webhook arrives without a vendor_data payload.
-- Bypasses RLS so the backend (using anon key) can execute it.
-- ============================================================

CREATE OR REPLACE FUNCTION verify_pending_organizer(p_status TEXT, p_session_id TEXT)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  -- 1. Find the most recently updated profile in 'pending' status
  SELECT id INTO v_user_id
  FROM profiles
  WHERE didit_status = 'pending'
  ORDER BY updated_at DESC
  LIMIT 1;

  -- 2. If no user found, return failure
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'No pending user found');
  END IF;

  -- 3. Update the found user's profile securely
  UPDATE profiles
  SET 
    didit_status = p_status,
    is_verified = (p_status = 'verified'),
    verified_at = CASE WHEN p_status = 'verified' THEN NOW() ELSE verified_at END,
    didit_session_id = COALESCE(p_session_id, didit_session_id)
  WHERE id = v_user_id;

  -- 4. Return success with the user ID
  RETURN json_build_object('success', true, 'user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
