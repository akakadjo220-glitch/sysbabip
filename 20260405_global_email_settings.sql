-- Migration: Add global email settings to platform_settings table
-- This allows administrators to enable/disable automated reminders and thank-you emails globally.

INSERT INTO platform_settings (key, value)
VALUES 
  ('enable_auto_reminders', 'true'),
  ('enable_auto_thanks', 'true')
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN platform_settings.key IS 'Clé de configuration système (ex: smtp_config, enable_auto_reminders).';
