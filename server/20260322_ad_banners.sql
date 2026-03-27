-- ============================================================
-- Migration: Ad Banners (Espaces Publicitaires)
-- Date: 2026-03-22
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_banners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  subtitle    TEXT,
  image_url   TEXT NOT NULL,
  cta_label   TEXT DEFAULT 'En savoir plus',
  cta_url     TEXT,
  badge_label TEXT,           -- e.g. "Sponsorisé", "Nouveau", "Promo"
  badge_color TEXT DEFAULT 'orange',  -- orange | blue | green | purple | red
  display_order INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ad_banners ENABLE ROW LEVEL SECURITY;

-- Public can read active banners
CREATE POLICY "public_read_active_banners"
  ON ad_banners FOR SELECT
  USING (is_active = true);

-- Admins can do everything (via service key or authenticated admin users)
CREATE POLICY "admin_all_banners"
  ON ad_banners
  USING (true)
  WITH CHECK (true);

-- Insert some demo banners
INSERT INTO ad_banners (title, subtitle, image_url, cta_label, cta_url, badge_label, badge_color, display_order) VALUES
(
  'Organisez votre prochain événement',
  'Créez, vendez vos billets et gérez vos participants en quelques clics avec Babipass Pro.',
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=2070&auto=format&fit=crop',
  'Démarrer gratuitement',
  '/organizer/login',
  'Pour les Organisateurs',
  'orange',
  1
),
(
  'Babipass Partnership',
  'Vous voulez promouvoir votre marque auprès de milliers de festivaliers ? Contactez notre équipe commerciale.',
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=2069&auto=format&fit=crop',
  'Nous contacter',
  'mailto:partenariat@babipass.com',
  'Publicité',
  'blue',
  2
);
