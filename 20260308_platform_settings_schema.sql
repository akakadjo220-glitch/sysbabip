-- 20260308_platform_settings_schema.sql
-- Table pour stocker les configurations globales de la plateforme (Templates Email, API, Paiements)
-- Remplace le stockage localStorage qui n'est pas partagé entre navigateurs/appareils

CREATE TABLE IF NOT EXISTS public.platform_settings (
    key TEXT PRIMARY KEY,           -- Identifiant unique de la config, ex: 'wa_config', 'email_templates'
    value JSONB NOT NULL,           -- Valeur de la configuration en format JSON
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger pour mettre à jour la date automatiquement
CREATE OR REPLACE FUNCTION update_platform_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_settings_updated ON public.platform_settings;
CREATE TRIGGER trg_platform_settings_updated
    BEFORE UPDATE ON public.platform_settings
    FOR EACH ROW EXECUTE FUNCTION update_platform_settings_timestamp();

-- Sécurité RLS : Seuls les admins peuvent lire/modifier
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Policy : Lecture publique (pour charger les configs dans l'app, ex: passerelles actives)
CREATE POLICY "platform_settings_readable_by_all" ON public.platform_settings
    FOR SELECT USING (true);

-- Policy : Écriture uniquement par les admins authentifiés (vérification via profiles)
CREATE POLICY "platform_settings_writable_by_admins" ON public.platform_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Vérification
SELECT key, updated_at FROM public.platform_settings ORDER BY key;
