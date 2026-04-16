-- Add banner_url to tournaments
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS banner_url text;
