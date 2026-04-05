-- Migration: Add sales_close_before_minutes to events table
-- This allows organizers to set a deadline for ticket sales before the event starts.

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS sales_close_before_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS thanks_email_sent BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN events.sales_close_before_minutes IS 'Délai en minutes avant le début de l''événement pour la clôture automatique des ventes (0 = pas de clôture).';
COMMENT ON COLUMN events.thanks_email_sent IS 'Drapeau indiquant si les emails de remerciement automatisés ont été envoyés pour cet événement.';
