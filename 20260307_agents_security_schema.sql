-- 20260307_agents_security_schema.sql
-- Sécurisation de la table agents : hachage des PINs avec pgcrypto

-- 1. Activer l'extension pgcrypto (nécessaire pour crypt() et gen_salt())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Ajouter une colonne pour le PIN haché (si elle n'existe pas)
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- 3. Migrer les PINs existants en clair vers des hashs sécurisés (blowfish)
UPDATE public.agents
SET pin_hash = crypt(auth_pin::text, gen_salt('bf'))
WHERE auth_pin IS NOT NULL AND pin_hash IS NULL;

-- 4. (Optionnel mais recommandé) Effacer les PINs en clair après migration
-- Commentez cette ligne si vous souhaitez garder un rollback possible
-- UPDATE public.agents SET auth_pin = NULL WHERE pin_hash IS NOT NULL;

-- 5. Ajouter une colonne email si elle n'existe pas déjà (pour afficher dans l'interface)
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS email TEXT;

-- 6. Ajouter une colonne is_active pour activer/désactiver un agent
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Vérification
SELECT id, name, agent_code, phone, email, is_active,
       CASE WHEN pin_hash IS NOT NULL THEN '✅ Sécurisé' ELSE '⚠️ PIN en clair' END as security_status
FROM public.agents;
