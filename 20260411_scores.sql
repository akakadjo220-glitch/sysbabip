-- ============================================================
-- Phase 3 Sport — Scores Live
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- 1. Colonnes de score sur la table events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS home_score   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_score   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_status text    DEFAULT 'scheduled';
-- match_status: 'scheduled' | 'live' | 'halftime' | 'fulltime' | 'postponed' | 'cancelled'

-- 2. Index pour filtrage rapide des matchs live
CREATE INDEX IF NOT EXISTS events_match_status_idx ON public.events(match_status);

-- 3. Activer Supabase Realtime sur la table events (si pas encore fait)
-- Dans Supabase Dashboard → Database → Replication → events table → enable
-- Ou via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
