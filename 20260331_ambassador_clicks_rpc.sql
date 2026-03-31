-- 20260331_ambassador_clicks_rpc.sql

-- Incrémente les statistiques des clics d'un lien ambassadeur en toute sécurité
CREATE OR REPLACE FUNCTION increment_ambassador_clicks(p_code TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.ambassador_links 
    SET clicks = clicks + 1
    WHERE code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
