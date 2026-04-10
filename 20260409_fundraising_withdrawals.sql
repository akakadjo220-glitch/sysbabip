-- Migration: Système de retraits des collectes de fonds
-- À exécuter dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS fundraising_withdrawals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES fundraising_campaigns(id) ON DELETE CASCADE NOT NULL,
  organizer_id UUID REFERENCES profiles(id) NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT DEFAULT 'pending' NOT NULL, -- 'pending' | 'approved' | 'paid' | 'rejected'
  payment_method TEXT, -- 'mobile_money' | 'bank_transfer'
  payment_details TEXT,
  admin_note TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE fundraising_withdrawals ENABLE ROW LEVEL SECURITY;

-- Organisateur voit seulement ses propres demandes
CREATE POLICY "org_own_fundraising_withdrawals" ON fundraising_withdrawals
  FOR ALL USING (organizer_id = auth.uid());

-- Admin voit tout
CREATE POLICY "admin_all_fundraising_withdrawals" ON fundraising_withdrawals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_fw_campaign ON fundraising_withdrawals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_fw_organizer ON fundraising_withdrawals(organizer_id);
CREATE INDEX IF NOT EXISTS idx_fw_status ON fundraising_withdrawals(status);
