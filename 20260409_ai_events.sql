-- Migration: Add ai_context to events table
-- This allows the Organizer Dashboard to save AI specific instructions for WhatsApp ticketing agents.

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS ai_context text;
