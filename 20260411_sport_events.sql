-- ============================================================
-- Phase 1 Sport : Ajout des colonnes sport sur events et ticket_types
-- + nouvelles catégories sportives
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- 1. Colonnes sport sur la table events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS sport_type     text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS home_team      text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS away_team      text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS competition    text;

-- 2. Zone de stade sur ticket_types
ALTER TABLE public.ticket_types ADD COLUMN IF NOT EXISTS stadium_zone text;

-- 3. Catégories sportives dans event_categories
INSERT INTO public.event_categories (name, icon, display_order) VALUES
  ('Football',      'Trophy',   5),
  ('Basketball',    'Trophy',   6),
  ('Rugby',         'Trophy',   7),
  ('Athlétisme',    'Trophy',   8),
  ('Sport',         'Trophy',   9)
ON CONFLICT (name) DO NOTHING;

-- Note : La catégorie générique "Sport" existait déjà (display_order=5)
-- Les nouvelles catégories permettent un filtre plus précis par discipline
