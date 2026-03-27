-- ============================================================
-- MIGRATION: Add views tracking to events + RPC
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add views column to events (defaults to 0)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0;

-- 2. Create the RPC function to safely increment views
CREATE OR REPLACE FUNCTION public.increment_event_view(evt_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.events
  SET views = views + 1
  WHERE id = evt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute for anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.increment_event_view(UUID) TO anon, authenticated;
