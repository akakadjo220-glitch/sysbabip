-- Création de la table des Agents (POS)
CREATE TABLE IF NOT EXISTS public.agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    auth_pin TEXT NOT NULL,
    role TEXT DEFAULT 'Agent',
    organizer_id UUID REFERENCES public.profiles(id),
    event_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW())
);

-- Activation de la sécurité RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Politiques de sécurité (Policies)
-- Supabase permet d'utiliser des quotes simples ou doubles, mais ne pas utiliser de backslash (\)
DROP POLICY IF EXISTS "Organisateur peut voir ses agents" ON public.agents;
CREATE POLICY "Organisateur peut voir ses agents"
ON public.agents FOR SELECT
USING (auth.uid() = organizer_id OR auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'ADMIN'));

DROP POLICY IF EXISTS "Organisateur peut gerer ses agents" ON public.agents;
CREATE POLICY "Organisateur peut gerer ses agents"
ON public.agents FOR ALL
USING (auth.uid() = organizer_id OR auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'ADMIN'));

-- Modification de la table des transactions pour inclure les ventes d'Agents (Cash)
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id),
ADD COLUMN IF NOT EXISTS is_cash BOOLEAN DEFAULT FALSE;
