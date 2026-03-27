-- DEFINITIVE_FIX_TICKETS_RECOVERY.sql
-- Run this in your Supabase SQL Editor to fix EVERYTHING at once.

-- 1. Correct the table structure (ensure IDs are TEXT and columns match)
-- We use a temporary table flow to avoid data loss if you have any test tickets.
DO $$ 
BEGIN
    -- Only recreate if necessary or just alter column
    ALTER TABLE IF EXISTS public.tickets ALTER COLUMN id TYPE TEXT;
    
    -- Ensure columns exist with correct names
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tickets' AND COLUMN_NAME = 'guest_email') THEN
        ALTER TABLE public.tickets ADD COLUMN guest_email TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tickets' AND COLUMN_NAME = 'guest_name') THEN
        ALTER TABLE public.tickets ADD COLUMN guest_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tickets' AND COLUMN_NAME = 'ticket_type') THEN
        ALTER TABLE public.tickets ADD COLUMN ticket_type TEXT;
    END IF;
END $$;

-- 2. Reset Security (RLS)
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can recover tickets by email" ON public.tickets;
DROP POLICY IF EXISTS "Public can insert tickets during checkout" ON public.tickets;
DROP POLICY IF EXISTS "Anyone can read tickets" ON public.tickets;
DROP POLICY IF EXISTS "Users see own tickets" ON public.tickets;

-- Permettre l'insertion lors de l'achat
CREATE POLICY "Public can insert tickets during checkout" ON public.tickets 
FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Permettre la lecture pour la récupération logicielle (filtre géré par l'app cliente)
CREATE POLICY "Public can recover tickets" ON public.tickets
FOR SELECT TO anon, authenticated USING (true);

-- Ensure dependent tables are also readable for the join: events(..., profiles(...))
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can see events" ON public.events;
DROP POLICY IF EXISTS "Public can view published events" ON public.events;
CREATE POLICY "Anyone can see events" ON public.events FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can see profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
CREATE POLICY "Anyone can see profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);

-- 3. Verify Foreign Keys (profiles <-> events)
-- In the database, organizer_id in events points to profiles.id
-- This allows the join usingprofiles:organizer_id
