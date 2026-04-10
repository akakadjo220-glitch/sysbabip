-- Migration: Fix relations and roles for ambassador_withdrawals
-- À exécuter dans Supabase SQL Editor

-- 1. Réparer la clé étrangère pour permettre de l'afficher dans les requêtes React
-- Remplace la référence à `auth.users` par `public.profiles` indispensable pour Supabase
ALTER TABLE public.ambassador_withdrawals DROP CONSTRAINT IF EXISTS ambassador_withdrawals_user_id_fkey;
ALTER TABLE public.ambassador_withdrawals ADD CONSTRAINT ambassador_withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. On supprime les anciennes politiques RLS
DROP POLICY IF EXISTS "Admins can update withdrawals" ON public.ambassador_withdrawals;
DROP POLICY IF EXISTS "Admins can view all withdrawals" ON public.ambassador_withdrawals;

-- 3. L'Admin peut voir tous les retraits
CREATE POLICY "Admins can view all withdrawals"
    ON public.ambassador_withdrawals FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
        )
    );

-- 4. Seul l'Admin peut modifier les retraits (approuver, payer, rejeter)
CREATE POLICY "Admins can update withdrawals"
    ON public.ambassador_withdrawals FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
        )
    );
