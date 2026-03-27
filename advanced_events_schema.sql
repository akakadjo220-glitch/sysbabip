-- advanced_events_schema.sql
-- Run this script in your Supabase SQL Editor to support the new advanced Event features.

-- 1. Create a table for Advanced Ticket Types linked to an Event
CREATE TABLE IF NOT EXISTS public.ticket_types (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0,
    capacity INT NOT NULL DEFAULT 0,
    sold INT NOT NULL DEFAULT 0,
    features JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create a table for Event Programs / Agendas
CREATE TABLE IF NOT EXISTS public.event_programs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    time_str TEXT NOT NULL, -- e.g., '18:00'
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_programs ENABLE ROW LEVEL SECURITY;

-- Create Policies (Public read, Organizer/Admin write - Adjust according to your existing RLS logic)
-- Assuming anyone can view tickets/programs for published events:
CREATE POLICY "Public can view ticket types" ON public.ticket_types FOR SELECT USING (true);
CREATE POLICY "Public can view event programs" ON public.event_programs FOR SELECT USING (true);

-- Assuming authenticated organizers can insert their own (using Supabase auth):
-- (You may need to tweak this to match exactly how you handle organizer permissions in your app)
CREATE POLICY "Organizers can insert ticket types" ON public.ticket_types FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Organizers can insert programs" ON public.event_programs FOR ALL USING (auth.role() = 'authenticated');
