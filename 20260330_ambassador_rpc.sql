-- 20260330_ambassador_rpc.sql

-- Fonction pour mettre à jour les statistiques d'un lien ambassadeur en toute sécurité
CREATE OR REPLACE FUNCTION increment_ambassador_stats(
    p_code TEXT, 
    p_sales INT, 
    p_earned NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.ambassador_links
    SET 
        sales = sales + p_sales,
        earned_amount = earned_amount + p_earned
    WHERE code = p_code;
END;
$$;
