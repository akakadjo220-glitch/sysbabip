-- Migration: Ajout du champ NFC sur les billets physiques
-- À exécuter dans Supabase SQL Editor

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS nfc_encoded BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS nfc_encoded_at TIMESTAMPTZ;

-- Index pour filtre rapide sur l'onglet NFC
CREATE INDEX IF NOT EXISTS idx_tickets_nfc_encoded ON tickets(nfc_encoded, event_id);
