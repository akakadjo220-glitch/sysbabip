-- migrations/20260301_add_bi_features.sql

-- 1. Create Payout Requests table for Cash Advance
CREATE TYPE payout_status AS ENUM ('pending', 'approved', 'rejected', 'paid');

CREATE TABLE payout_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  organizer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'FCFA',
  status payout_status DEFAULT 'pending',
  type TEXT DEFAULT 'cash_advance', -- 'cash_advance' or 'final_payout'
  notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id)
);

ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers can view own payout requests" 
ON payout_requests FOR SELECT USING (auth.uid() = organizer_id);

CREATE POLICY "Organizers can insert payout requests" 
ON payout_requests FOR INSERT WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Admins can view and update all payout requests" 
ON payout_requests FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);

-- 2. Add buyer_location to transactions for Heatmap
-- We will store basic lat/lng or city info upon purchase
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS buyer_location JSONB; -- e.g., { lat: 5.3599, lng: -4.0083, city: 'Abidjan', neighborhood: 'Cocody' }

-- 3. Add seed data for Heatmap (Updating existing transactions with fake locations)
UPDATE transactions 
SET buyer_location = '{"lat": 5.3599, "lng": -4.0083, "city": "Abidjan", "neighborhood": "Cocody"}'::jsonb
WHERE method = 'OM' AND buyer_location IS NULL;

UPDATE transactions 
SET buyer_location = '{"lat": 5.3096, "lng": -4.0126, "city": "Abidjan", "neighborhood": "Marcory"}'::jsonb
WHERE method = 'WAVE' AND buyer_location IS NULL;

UPDATE transactions 
SET buyer_location = '{"lat": 5.3283, "lng": -4.0207, "city": "Abidjan", "neighborhood": "Plateau"}'::jsonb
WHERE method = 'CB' AND buyer_location IS NULL;
