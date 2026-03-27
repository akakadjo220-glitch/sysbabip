-- Ajouter le champ vidéo (chaine de caractères)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS video TEXT;

-- Ajouter le champ gallery (tableau de Json ou de chaines)
-- Supabase préfère souvent array de text ou jsonb. Le type 'text[]' est adapté pour les URLS.
ALTER TABLE events
ADD COLUMN IF NOT EXISTS gallery TEXT[];
