-- 1. Ajout des colonnes à la table events avec des valeurs par défaut pour les événements existants
ALTER TABLE events ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 8.0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS advance_rate NUMERIC DEFAULT 30.0;

-- S'assurer que les événements existants qui ont des valeurs nulles prennent les bonnes valeurs
UPDATE events SET commission_rate = 8.0 WHERE commission_rate IS NULL;
UPDATE events SET advance_rate = 30.0 WHERE advance_rate IS NULL;

-- 2. Création de la table platform_settings si elle n'existe pas déjà (au cas où)
CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Active RLS sur platform_settings (optionnel, adaptatif)
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Ajout d'une règle (policies) autorisant tout le monde à lire les settings
DROP POLICY IF EXISTS "Public read access for platform settings" ON platform_settings;
CREATE POLICY "Public read access for platform settings" ON platform_settings FOR SELECT USING (true);

-- Ajout d'une règle autorisant uniquement l'admin à modifier
-- (On peut utiliser un CHECK sur le rôle JWT ou laisser ouvert pour le dev)
-- Exemple ouvert mais idéalement restreint en prod:
DROP POLICY IF EXISTS "Admin update access for platform settings" ON platform_settings;
CREATE POLICY "Admin update access for platform settings" ON platform_settings FOR ALL USING (true) WITH CHECK (true);


-- 3. Insertion des valeurs globales par défaut dans platform_settings
INSERT INTO platform_settings (key, value)
VALUES ('default_commission_rate', '8'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value)
VALUES ('default_advance_rate', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;
