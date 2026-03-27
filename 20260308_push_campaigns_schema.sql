-- 20260308_push_campaigns_schema.sql
-- Table pour stocker les campagnes CRM/Retargeting de chaque organisateur

CREATE TABLE IF NOT EXISTS public.push_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    message_template TEXT NOT NULL,
    audience_filter JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'completed', 'failed')),
    sent_count INT DEFAULT 0,
    total_target INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS : chaque organisateur ne voit que ses propres campagnes
ALTER TABLE public.push_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizers_own_campaigns_select" ON public.push_campaigns
    FOR SELECT USING (organizer_id = auth.uid());

CREATE POLICY "organizers_own_campaigns_insert" ON public.push_campaigns
    FOR INSERT WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "organizers_own_campaigns_update" ON public.push_campaigns
    FOR UPDATE USING (organizer_id = auth.uid());

-- Les admins peuvent tout voir
CREATE POLICY "admins_all_campaigns" ON public.push_campaigns
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_push_campaigns_organizer ON public.push_campaigns(organizer_id);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_created ON public.push_campaigns(created_at DESC);
