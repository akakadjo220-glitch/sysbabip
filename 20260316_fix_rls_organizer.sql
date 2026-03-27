-- ============================================================
-- FIX: Politiques RLS pour accès Organisateur
-- Problème : l'organisateur ne peut pas voir les transactions
-- de ses événements car la politique actuelle ne couvre que
-- le buyer (user_id = auth.uid()), pas l'organisateur de l'event.
-- 
-- À exécuter dans le SQL Editor de Supabase
-- ============================================================

-- 1. Ajouter une politique RLS pour que les organisateurs
--    puissent voir les transactions de leurs événements
DROP POLICY IF EXISTS "Organizers see transactions for own events" ON transactions;
CREATE POLICY "Organizers see transactions for own events"
  ON transactions FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM events WHERE organizer_id = auth.uid()
    )
  );

-- 2. Ajouter une politique RLS pour que les organisateurs
--    puissent voir les tickets vendus pour leurs événements
DROP POLICY IF EXISTS "Organizers see tickets for own events" ON tickets;
CREATE POLICY "Organizers see tickets for own events"
  ON tickets FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM events WHERE organizer_id = auth.uid()
    )
  );

-- 3. Vérifier que les admins peuvent tout voir (transactions + tickets)
DROP POLICY IF EXISTS "Admins see all transactions" ON transactions;
CREATE POLICY "Admins see all transactions"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "Admins see all tickets" ON tickets;
CREATE POLICY "Admins see all tickets"
  ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- 4. S'assurer que la colonne 'views' existe bien sur events
--    (au cas où la migration précédente n'aurait pas été appliquée)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0;

-- 5. Recréer la fonction RPC increment_event_view si nécessaire  
CREATE OR REPLACE FUNCTION public.increment_event_view(evt_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.events
  SET views = views + 1
  WHERE id = evt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_event_view(UUID) TO anon, authenticated;

-- Vérification: lister les politiques actives sur ces tables
-- SELECT schemaname, tablename, policyname, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename IN ('transactions', 'tickets', 'events')
-- ORDER BY tablename, policyname;
