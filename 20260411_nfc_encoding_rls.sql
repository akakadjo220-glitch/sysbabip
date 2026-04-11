-- ============================================================
-- FIX: Politiques RLS pour l'encodage NFC des billets
-- Problème : L'organisateur ne pouvait pas mettre à jour le statut NFC
-- de ses billets car aucune politique RLS n'autorisait l'UPDATE sur "tickets".
-- ============================================================

-- Assurons-nous que les colonnes NFC existent (au cas où le script précédent a été ignoré)
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS nfc_encoded BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS nfc_encoded_at TIMESTAMPTZ;

-- Ajout de la politique d'UPDATE pour les organisateurs
DROP POLICY IF EXISTS "Organizers can update tickets for own events" ON public.tickets;
CREATE POLICY "Organizers can update tickets for own events"
  ON public.tickets FOR UPDATE
  USING (
    event_id IN (
      SELECT id FROM public.events WHERE organizer_id = auth.uid()
    )
  );

-- Ajout de la politique pour les Admins au cas où
DROP POLICY IF EXISTS "Admins can update tickets" ON public.tickets;
CREATE POLICY "Admins can update tickets"
  ON public.tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );
