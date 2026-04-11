-- ============================================================
-- Phase 3 Sport — Pass Saison
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- 1. Colonnes sur ticket_types pour identifier les pass saison
ALTER TABLE public.ticket_types
  ADD COLUMN IF NOT EXISTS pass_type text DEFAULT 'standard',          -- 'standard' | 'season'
  ADD COLUMN IF NOT EXISTS linked_tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- 2. Table season_passes : produit "abonnement" lié à un tournoi
CREATE TABLE IF NOT EXISTS public.season_passes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name           text NOT NULL DEFAULT 'Pass Saison',
  description    text,
  price          integer NOT NULL DEFAULT 0,
  capacity       integer NOT NULL DEFAULT 500,
  sold           integer DEFAULT 0,
  features       text[] DEFAULT '{}',
  is_active      boolean DEFAULT true,
  organizer_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now()
);

-- 3. Colonnes sur tickets pour lier un billet à un pass saison
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS pass_id        uuid REFERENCES public.season_passes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tournament_id  uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- 4. Table de présence par match pour les pass saison
CREATE TABLE IF NOT EXISTS public.season_pass_checkins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   text NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  pass_id     uuid REFERENCES public.season_passes(id) ON DELETE SET NULL,
  scanned_at  timestamptz DEFAULT now(),
  UNIQUE(ticket_id, event_id)
);

-- 5. RLS
ALTER TABLE public.season_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_pass_checkins ENABLE ROW LEVEL SECURITY;

-- Lecture publique des pass actifs
CREATE POLICY "season_passes_public_read"
  ON public.season_passes FOR SELECT USING (is_active = true);

-- Organisateur CRUD
CREATE POLICY "season_passes_organizer_all"
  ON public.season_passes FOR ALL USING (organizer_id = auth.uid());

-- Checkins : lecture par l'organisateur du tournoi
CREATE POLICY "checkins_organizer_read"
  ON public.season_pass_checkins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.season_passes sp
      JOIN public.tournaments t ON t.id = sp.tournament_id
      WHERE sp.id = season_pass_checkins.pass_id
        AND t.organizer_id = auth.uid()
    )
  );

-- Checkins : insertion par n'importe qui (le scanner insère)
CREATE POLICY "checkins_insert_public"
  ON public.season_pass_checkins FOR INSERT WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS season_passes_tournament_idx ON public.season_passes(tournament_id);
CREATE INDEX IF NOT EXISTS tickets_pass_id_idx          ON public.tickets(pass_id);
CREATE INDEX IF NOT EXISTS tickets_tournament_id_idx    ON public.tickets(tournament_id);
