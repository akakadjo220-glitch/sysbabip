-- 20260307_agent_type_schema.sql
-- Ajout du champ agent_type pour distinguer les agents POS (vente) des agents Scanneurs (contrôle entrée)

-- 1. Ajouter la colonne agent_type avec 'POS' comme valeur par défaut
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'POS' CHECK (agent_type IN ('POS', 'SCANNER'));

-- 2. Mettre à jour les agents existants qui n'ont pas de type
UPDATE public.agents SET agent_type = 'POS' WHERE agent_type IS NULL;

-- Vérification
SELECT id, name, agent_code, agent_type, is_active FROM public.agents;
