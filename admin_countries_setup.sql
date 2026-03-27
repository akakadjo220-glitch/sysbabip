-- admin_countries_setup.sql
-- Create a table to manage Supported Countries

CREATE TABLE IF NOT EXISTS public.supported_countries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    currency TEXT DEFAULT 'FCFA',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure logo column exists if the table was created previously
ALTER TABLE public.supported_countries ADD COLUMN IF NOT EXISTS logo TEXT;

-- Enable RLS
ALTER TABLE public.supported_countries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies back to avoid "already exists" errors
DROP POLICY IF EXISTS "Public can view active countries" ON public.supported_countries;
DROP POLICY IF EXISTS "Admins can insert countries" ON public.supported_countries;
DROP POLICY IF EXISTS "Admins can update countries" ON public.supported_countries;
DROP POLICY IF EXISTS "Admins can delete countries" ON public.supported_countries;

-- Policies
-- Anyone can view active countries
CREATE POLICY "Public can view active countries" ON public.supported_countries FOR SELECT USING (is_active = true);

-- Admins can manage countries
CREATE POLICY "Admins can insert countries" ON public.supported_countries FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

CREATE POLICY "Admins can update countries" ON public.supported_countries FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

CREATE POLICY "Admins can delete countries" ON public.supported_countries FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

-- Init Default Data
INSERT INTO public.supported_countries (name, code, currency, is_active)
VALUES 
('Côte d''Ivoire', 'CI', 'FCFA', true),
('Sénégal', 'SN', 'FCFA', true),
('Cameroun', 'CM', 'FCFA', true),
('Mali', 'ML', 'FCFA', true)
ON CONFLICT (code) DO NOTHING;
