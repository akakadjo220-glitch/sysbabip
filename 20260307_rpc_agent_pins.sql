-- 20260307_rpc_agent_pins.sql
-- Fonctions RPC Supabase pour le hachage sécurisé des PINs agents

-- 1. Extension pgcrypto requise
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Ajouter toutes les colonnes manquantes à la table agents
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS agent_code TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS auth_pin TEXT;

-- 3. Fonction pour hacher un PIN lors de la création d'un agent
CREATE OR REPLACE FUNCTION public.hash_pin(input_pin TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT crypt(input_pin, gen_salt('bf', 8));
$$;

-- 4. Fonction pour vérifier un PIN lors de la connexion d'un agent
CREATE OR REPLACE FUNCTION public.verify_agent_pin(input_pin TEXT, stored_hash TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT (stored_hash = crypt(input_pin, stored_hash));
$$;

-- 5. Accorder les permissions d'exécution
GRANT EXECUTE ON FUNCTION public.hash_pin(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.hash_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_agent_pin(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_agent_pin(TEXT, TEXT) TO authenticated;

-- 6. Migrer les PINs existants en clair vers des hashs sécurisés
UPDATE public.agents
SET pin_hash = crypt(auth_pin::text, gen_salt('bf', 8))
WHERE auth_pin IS NOT NULL AND pin_hash IS NULL;

-- 7. Vérification finale (toutes les colonnes existent maintenant)
SELECT id, name, agent_code,
       CASE WHEN pin_hash IS NOT NULL THEN 'PIN Sécurisé (hash)' ELSE 'PIN en clair' END as security
FROM public.agents;
