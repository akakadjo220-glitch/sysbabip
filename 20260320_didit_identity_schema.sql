-- ============================================================
-- Migration: 20260320_didit_identity_schema.sql
-- Description:
-- Adds support for identity verification (KYC) via Didit.me.
-- ============================================================

-- 1. Table update
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS didit_status TEXT DEFAULT 'not_started'; 
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS didit_session_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 2. Helper function to update verification status (useful for webhooks and testing)
CREATE OR REPLACE FUNCTION verify_organizer(p_user_id UUID, p_status TEXT)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET 
    didit_status = p_status,
    is_verified = (p_status = 'verified'),
    verified_at = CASE WHEN p_status = 'verified' THEN NOW() ELSE verified_at END
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
