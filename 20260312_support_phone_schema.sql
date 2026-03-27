-- Ajout des colonnes manquantes à la table events
-- practical_infos : infos pratiques (parking, sécurité, horaires, etc.)
ALTER TABLE events ADD COLUMN IF NOT EXISTS practical_infos JSONB DEFAULT '[]'::jsonb;

-- support_phone : numéro de téléphone affiché sur les billets pour le support / l'infoline
ALTER TABLE events ADD COLUMN IF NOT EXISTS support_phone TEXT DEFAULT '';
