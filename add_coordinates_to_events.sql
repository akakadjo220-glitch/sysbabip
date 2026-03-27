-- Mettre à jour la table des événements pour le système cartographique
ALTER TABLE events
ADD COLUMN IF NOT EXISTS coordinates JSONB;
