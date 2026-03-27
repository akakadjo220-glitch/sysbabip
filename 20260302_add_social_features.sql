-- Création de la table pour les liens d'affiliation (Ambassadeurs)
CREATE TABLE IF NOT EXISTS public.affiliate_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  event_id UUID REFERENCES public.events(id) NOT NULL,
  unique_code TEXT UNIQUE NOT NULL,
  clicks INTEGER DEFAULT 0,
  sales INTEGER DEFAULT 0,
  commission_earned NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Activation de RLS pour affiliate_links
ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own affiliate links"
  ON public.affiliate_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view affiliate links to track clicks/sales"
  ON public.affiliate_links FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own affiliate links"
  ON public.affiliate_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sellers can update affiliate links (clicks/sales)"
  ON public.affiliate_links FOR UPDATE
  USING (true);

-- Création de la table pour les auto-réponses du Bot WhatsApp
CREATE TABLE IF NOT EXISTS public.bot_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES public.events(id) NOT NULL,
  trigger_word TEXT NOT NULL,
  response_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Activation de RLS pour bot_rules
ALTER TABLE public.bot_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active bot rules"
  ON public.bot_rules FOR SELECT
  USING (true);

CREATE POLICY "Organizers can manage their own bot rules"
  ON public.bot_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = bot_rules.event_id AND events.organizer_id = auth.uid()
    )
  );

-- Ajout du code d'affiliation sur les transactions (pour l'attribution)
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS affiliate_code TEXT;

-- Ajout d'une foreign key logique vers l'affiliate link
-- (optionnel mais utile si besoin de cascading. Ici on garde un TEXT)

-- Politique pour que tout le monde voie les bot rules (pour simuler la réponse)
-- Déjà ajoutée via le SELECT USING (true)

-- Insertion de quelques règles de démo
INSERT INTO public.bot_rules (event_id, trigger_word, response_text, is_active)
SELECT id, 'parking', '🚗 Le parking officiel est situé au sud de la zone événementielle. Tarif unique de 1000 FCFA pour la soirée. Places limitées !', true
FROM public.events
LIMIT 1;

INSERT INTO public.affiliate_links (user_id, event_id, unique_code, clicks, sales, commission_earned)
SELECT 
  (SELECT id FROM public.profiles LIMIT 1 OFFSET 1), -- random user
  (SELECT id FROM public.events LIMIT 1),
  'AMB' || substring(md5(random()::text) from 1 for 6),
  42,
  5,
  2500
WHERE EXISTS (SELECT 1 FROM public.profiles) AND EXISTS (SELECT 1 FROM public.events);
