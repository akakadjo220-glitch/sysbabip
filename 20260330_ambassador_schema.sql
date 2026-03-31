-- 20260330_ambassador_schema.sql

-- 1. Modifiction de la table events pour la configuration ambassadeur
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ambassador_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ambassador_commission_type TEXT DEFAULT 'percentage'; -- 'percentage' or 'fixed'
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ambassador_commission_value NUMERIC DEFAULT 10; -- 10% or 1000 FCFA

-- 2. Création de la table ambassador_links (Liens uniques par utilisateur et événement)
CREATE TABLE IF NOT EXISTS public.ambassador_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL, -- The unique referral code (e.g., AMB-XXXXXX)
    clicks INT DEFAULT 0,
    sales INT DEFAULT 0,
    earned_amount NUMERIC DEFAULT 0,
    UNIQUE(user_id, event_id) -- One link per user per event
);

-- 3. Modification de la table transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS ambassador_commission NUMERIC DEFAULT 0;

-- 4. Création de la table pour les retraits des ambassadeurs
CREATE TABLE IF NOT EXISTS public.ambassador_withdrawals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    payment_method TEXT NOT NULL, -- e.g., 'WAVE', 'OM', 'MTN'
    payment_details TEXT NOT NULL, -- e.g., Phone number
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'paid'
    paid_at TIMESTAMPTZ
);

-- ==========================================
-- RLS SECURITY POLICIES
-- ==========================================

-- Activer RLS
ALTER TABLE public.ambassador_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_withdrawals ENABLE ROW LEVEL SECURITY;

-- Politiques pour ambassador_links
-- 1. Un utilisateur peut voir ses propres liens
CREATE POLICY "Users can view own ambassador links" 
    ON public.ambassador_links FOR SELECT 
    USING (auth.uid() = user_id);

-- 2. Tout le monde peut voir un lien par son code (pour tracker les clics)
CREATE POLICY "Public can view link by code"
    ON public.ambassador_links FOR SELECT
    USING (true);

-- 3. Un utilisateur peut créer son propre lien
CREATE POLICY "Users can create own ambassador link"
    ON public.ambassador_links FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Politiques pour ambassador_withdrawals
-- 1. Un utilisateur peut voir ses propres retraits
CREATE POLICY "Users can view own withdrawals"
    ON public.ambassador_withdrawals FOR SELECT
    USING (auth.uid() = user_id);

-- 2. Un utilisateur peut créer une demande de retrait
CREATE POLICY "Users can insert own withdrawals"
    ON public.ambassador_withdrawals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 3. Seul l'Admin peut modifier les retraits (approuver, payer, rejeter)
CREATE POLICY "Admins can update withdrawals"
    ON public.ambassador_withdrawals FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
        )
    );

-- 4. L'Admin peut voir tous les retraits
CREATE POLICY "Admins can view all withdrawals"
    ON public.ambassador_withdrawals FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
        )
    );
