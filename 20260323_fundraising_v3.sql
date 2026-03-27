-- ============================================================
-- Mise à jour V3 - Collectes de fonds : Commission / Ffrais de plateforme
-- 2026-03-24 (Utilisation d'un taux spécifique pour générer un revenu)
-- ============================================================

-- 1. Ajouter les colonnes "platform_fee" et "net_amount"
--    Permet à l'administrateur de suivre ses revenus sur les collectes.
ALTER TABLE fundraising_contributions
ADD COLUMN IF NOT EXISTS platform_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount NUMERIC DEFAULT 0;

-- 2. Créer/Mettre à jour la configuration par défaut (5%)
INSERT INTO platform_settings (key, value)
VALUES ('default_fundraising_commission_rate', '5.0'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 3. Vue simplifiée pour l'admin (Optionnel)
-- Permet de calculer les totaux facilement dans un Dashboard Admin
CREATE OR REPLACE FUNCTION get_admin_fundraising_stats()
RETURNS TABLE (
  total_raised NUMERIC,
  total_platform_fees NUMERIC,
  total_campaigns BIGINT,
  active_campaigns BIGINT,
  total_contributors BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(amount), 0) AS total_raised,
    COALESCE(SUM(platform_fee), 0) AS total_platform_fees,
    (SELECT COUNT(*) FROM fundraising_campaigns) AS total_campaigns,
    (SELECT COUNT(*) FROM fundraising_campaigns WHERE status = 'active') AS active_campaigns,
    COUNT(*) AS total_contributors
  FROM fundraising_contributions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
