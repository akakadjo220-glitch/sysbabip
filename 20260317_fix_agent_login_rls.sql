-- ============================================================
-- FIX: Agent Login - RLS Policy
-- La connexion agent se fait en mode anonyme (anon role).
-- En production, RLS bloque l'accès à la table `agents` pour
-- les utilisateurs non authentifiés. Ce script corrige cela
-- de manière sécurisée via une fonction RPC SECURITY DEFINER
-- qui ne retourne les données minimales nécessaires que si
-- le code agent et le PIN correspondent.
-- ============================================================

-- 1. S'assurer que pgcrypto est activé
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Créer une fonction RPC sécurisée pour la connexion agent
-- Cette fonction tourne avec les droits de son créateur (SECURITY DEFINER)
-- et contourne le RLS, mais uniquement si les identifiants sont valides.
CREATE OR REPLACE FUNCTION public.agent_login(p_agent_code TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent RECORD;
  v_pin_valid BOOLEAN;
BEGIN
  -- Chercher l'agent par son code (insensible à la casse)
  SELECT * INTO v_agent
  FROM public.agents
  WHERE UPPER(agent_code) = UPPER(p_agent_code)
  LIMIT 1;

  -- Agent introuvable
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Identifiant Agent introuvable.');
  END IF;

  -- Vérifier si l'agent est actif
  IF v_agent.is_active = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ce compte agent est désactivé. Contactez votre organisateur.');
  END IF;

  -- Vérification du PIN (priorité au hash, fallback sur PIN en clair)
  IF v_agent.pin_hash IS NOT NULL THEN
    v_pin_valid := (v_agent.pin_hash = crypt(p_pin, v_agent.pin_hash));
  ELSE
    v_pin_valid := (v_agent.auth_pin = p_pin);
  END IF;

  IF NOT v_pin_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Code PIN incorrect.');
  END IF;

  -- Connexion réussie : retourner uniquement les données nécessaires (sans PIN ni hash)
  RETURN jsonb_build_object(
    'success', true,
    'agent', jsonb_build_object(
      'id', v_agent.id,
      'name', v_agent.name,
      'agent_code', v_agent.agent_code,
      'agent_type', v_agent.agent_type,
      'email', v_agent.email,
      'phone', v_agent.phone,
      'event_id', v_agent.event_id,
      'organizer_id', v_agent.organizer_id,
      'is_active', v_agent.is_active
    )
  );
END;
$$;

-- 3. Accorder l'exécution à tout le monde (y compris anon)
GRANT EXECUTE ON FUNCTION public.agent_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_login(TEXT, TEXT) TO authenticated;

-- 4. Vérification que la fonction est bien créée
SELECT routine_name, routine_type, security_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'agent_login';
