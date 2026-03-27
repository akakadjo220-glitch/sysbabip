-- 20260306_promote_to_admin.sql
-- Fichier pour promouvoir un utilisateur existant en Administrateur

-- INSTRUCTIONS:
-- 1. Inscrivez-vous normalement depuis l'interface Organisateurs ou Citoyens avec votre email
-- 2. Remplacez 'votre.email@exemple.com' ci-dessous par l'adresse email utilisée
-- 3. Exécutez ce script dans l'éditeur SQL de Supabase

DO $$ 
DECLARE
    target_email TEXT := 'votre.email@exemple.com'; -- REMPLACEZ CECI PAR VOTRE VRAI EMAIL
    target_id UUID;
BEGIN
    -- 1. Trouver l'utilisateur par son email (dans le schéma de profils)
    SELECT id INTO target_id FROM public.profiles WHERE email = target_email LIMIT 1;

    -- 2. Si trouvé, on le met à jour
    IF target_id IS NOT NULL THEN
        UPDATE public.profiles 
        SET 
            role = 'ADMIN',
            status = 'active'
        WHERE id = target_id;
        
        RAISE NOTICE 'Utilisateur % promu Administrateur avec succès !', target_email;
    ELSE
        RAISE EXCEPTION 'Utilisateur avec l''email % introuvable dans la table profiles. Veuillez créer le compte d''abord.', target_email;
    END IF;
END $$;
