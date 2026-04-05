-- ============================================================
-- Fundraising Campaigns — Approval Workflow
-- 2026-03-23
-- ============================================================
-- Run this AFTER 20260323_fundraising.sql

-- 1. Add approval columns
ALTER TABLE fundraising_campaigns
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;

-- 2. Update the public read policy: only show APPROVED campaigns
DROP POLICY IF EXISTS "public_read_active_campaigns" ON fundraising_campaigns;

CREATE POLICY "public_read_active_campaigns"
  ON fundraising_campaigns FOR SELECT
  USING (status = 'active' AND approval_status = 'approved');

-- 3. Organiser can still read ALL their own campaigns (any approval status)
-- (covered by existing "organizer_manage_own_campaigns" policy — no change needed)

-- 4. Admin helper function to approve / reject
CREATE OR REPLACE FUNCTION review_fundraising_campaign(
  p_campaign_id UUID,
  p_status      TEXT,   -- 'approved' or 'rejected'
  p_reason      TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE fundraising_campaigns
  SET approval_status   = p_status,
      rejection_reason  = p_reason,
      updated_at        = NOW()
  WHERE id = p_campaign_id;
END;
$$;

-- 5. Add updated_at column if not present
ALTER TABLE fundraising_campaigns
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
