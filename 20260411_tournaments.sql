-- ============================================================
-- Phase 2 Sport — Table Tournois
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- 1. Table des tournois
CREATE TABLE IF NOT EXISTS public.tournaments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE,
  name        text NOT NULL,
  sport_type  text,
  competition text,
  organizer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date  date,
  end_date    date,
  logo_url    text,
  description text,
  status      text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at  timestamptz DEFAULT now()
);

-- 2. Lier les événements à un tournoi
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- 3. RLS
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Lecture publique des tournois actifs
CREATE POLICY "tournaments_public_read"
  ON public.tournaments FOR SELECT
  USING (status = 'active');

-- CRUD pour l'organisateur propriétaire
CREATE POLICY "tournaments_organizer_all"
  ON public.tournaments FOR ALL
  USING (organizer_id = auth.uid());

-- CRUD admin
CREATE POLICY "tournaments_admin_all"
  ON public.tournaments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
    )
  );

-- Index pour la recherche par slug
CREATE INDEX IF NOT EXISTS tournaments_slug_idx ON public.tournaments (slug);
CREATE INDEX IF NOT EXISTS events_tournament_id_idx ON public.events (tournament_id);
