-- ═══════════════════════════════════════════════════════════════════════════
-- COMPLÉMENT SÉCURITÉ — profils (e-mails, téléphones) fermés au public
-- ═══════════════════════════════════════════════════════════════════════════
-- À exécuter juste APRÈS 20261018_close_remaining_open_policies.sql.
--
-- Jusqu'ici n'importe qui pouvait lire toute la table profiles (e-mails,
-- téléphones, statut KYC…). Désormais :
--   * chacun lit son propre profil ;
--   * l'admin lit tout (phase0_admin_all) ;
--   * un organisateur lit le profil des ambassadeurs de ses événements ;
--   * le public ne voit que nom / société / avatar des organisateurs, via la
--     vue organizer_public_profiles (pages événement, tournoi, cagnotte).
-- La recherche « numéro → compte » de la page de connexion passe par le
-- serveur (/api/auth/resolve-phone, /api/auth/account-exists).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Suppression des policies ouvertes sur profiles ───────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true')
      AND roles <> '{service_role}'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', r.policyname);
    RAISE NOTICE 'Policy ouverte supprimée : profiles.% (%)', r.policyname, r.cmd;
  END LOOP;
END $$;

-- ─── 2. Lectures autorisées ───────────────────────────────────────────────
-- L'utilisateur est-il ambassadeur d'un événement de l'organisateur connecté ?
CREATE OR REPLACE FUNCTION public.is_my_ambassador(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ambassador_links al
    JOIN public.events e ON e.id = al.event_id
    WHERE al.user_id = p_user AND e.organizer_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_my_ambassador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_ambassador(uuid) TO authenticated;

DROP POLICY IF EXISTS sec_profiles_self_read ON public.profiles;
CREATE POLICY sec_profiles_self_read ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS sec_profiles_organizer_read_ambassadors ON public.profiles;
CREATE POLICY sec_profiles_organizer_read_ambassadors ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_my_ambassador(id));

-- ─── 3. Vitrine publique des organisateurs ────────────────────────────────
-- Vue exécutée avec les droits de son propriétaire : elle n'expose que ces
-- quatre colonnes, et seulement pour les comptes organisateurs.
CREATE OR REPLACE VIEW public.organizer_public_profiles AS
  SELECT p.id, p.name, p.company, p.avatar
  FROM public.profiles p
  WHERE p.role::text IN ('ORGANIZER', 'ADMIN')
     OR EXISTS (SELECT 1 FROM public.events e WHERE e.organizer_id = p.id);

REVOKE ALL ON public.organizer_public_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organizer_public_profiles TO anon, authenticated, service_role;

COMMIT;

-- Vérification : aucune ligne attendue
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'profiles' AND (qual = 'true' OR with_check = 'true');
