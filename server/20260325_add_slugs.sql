-- Add unaccent extension if not exists
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1. Add columns to events and fundraising_campaigns
ALTER TABLE events ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE fundraising_campaigns ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- 2. Backfill existing records with unique slugs
-- We append the first 5 chars of the UUID to guarantee uniqueness for old records
UPDATE events
SET slug = TRIM(BOTH '-' FROM lower(regexp_replace(unaccent(title), '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || substr(id::text, 1, 5)
WHERE slug IS NULL;

UPDATE fundraising_campaigns
SET slug = TRIM(BOTH '-' FROM lower(regexp_replace(unaccent(title), '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || substr(id::text, 1, 5)
WHERE slug IS NULL;

-- 3. Make the columns NOT NULL after backfill
ALTER TABLE events ALTER COLUMN slug SET NOT NULL;
ALTER TABLE fundraising_campaigns ALTER COLUMN slug SET NOT NULL;
