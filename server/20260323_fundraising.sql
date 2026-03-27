-- ============================================================
-- Collectes de fonds : tables + RLS
-- 2026-03-23
-- ============================================================

-- 1. Table des campagnes
CREATE TABLE IF NOT EXISTS fundraising_campaigns (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organizer_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  image           TEXT,
  goal_amount     NUMERIC NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'FCFA',
  end_date        DATE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table des contributions
CREATE TABLE IF NOT EXISTS fundraising_contributions (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id         UUID NOT NULL REFERENCES fundraising_campaigns(id) ON DELETE CASCADE,
  contributor_name    TEXT,
  contributor_email   TEXT,
  amount              NUMERIC NOT NULL,
  payment_method      TEXT,
  transaction_ref     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS
ALTER TABLE fundraising_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundraising_contributions ENABLE ROW LEVEL SECURITY;

-- Public: lecture des campagnes actives
CREATE POLICY "public_read_active_campaigns"
  ON fundraising_campaigns FOR SELECT
  USING (status = 'active');

-- Organisateur: gérer ses propres campagnes
CREATE POLICY "organizer_manage_own_campaigns"
  ON fundraising_campaigns FOR ALL
  USING (organizer_id = auth.uid())
  WITH CHECK (organizer_id = auth.uid());

-- Public: insérer une contribution (don)
CREATE POLICY "public_insert_contribution"
  ON fundraising_contributions FOR INSERT
  WITH CHECK (true);

-- Propriétaire de campagne: voir les contributions
CREATE POLICY "organizer_read_contributions"
  ON fundraising_contributions FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM fundraising_campaigns WHERE organizer_id = auth.uid()
    )
  );

-- Admin: accès complet
CREATE POLICY "admin_all_campaigns"
  ON fundraising_campaigns FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
  );

CREATE POLICY "admin_all_contributions"
  ON fundraising_contributions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- 4. Vue stats par campagne
CREATE OR REPLACE VIEW campaign_stats AS
SELECT
  fc.id AS campaign_id,
  fc.title,
  fc.organizer_id,
  fc.goal_amount,
  fc.currency,
  fc.end_date,
  fc.status,
  COALESCE(SUM(c.amount), 0) AS total_raised,
  COUNT(c.id)                AS contributor_count
FROM fundraising_campaigns fc
LEFT JOIN fundraising_contributions c ON c.campaign_id = fc.id
GROUP BY fc.id, fc.title, fc.organizer_id, fc.goal_amount, fc.currency, fc.end_date, fc.status;
