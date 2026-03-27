-- Script pour rajouter le numéro de téléphone dans la table profiles
-- Utile pour l'inscription des organisateurs où le numéro est obligatoire

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
