-- ============================================================
-- Migration: Add video_url support to ad_banners and events
-- Date: 2026-03-22
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Add video_url to ad_banners table
ALTER TABLE ad_banners ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add video_url to events table  
ALTER TABLE events ADD COLUMN IF NOT EXISTS video_url TEXT;
