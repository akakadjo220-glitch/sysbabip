
-- 1. CLEANUP (Pour repartir sur une base saine si nécessaire)
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS ticket_types CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS event_status CASCADE;
DROP TYPE IF EXISTS ticket_type_enum CASCADE;

-- 2. ENUMS
CREATE TYPE user_role AS ENUM ('GUEST', 'USER', 'ORGANIZER', 'ADMIN', 'STAFF');
CREATE TYPE event_status AS ENUM ('published', 'draft', 'ended', 'pending_review');
CREATE TYPE ticket_type_enum AS ENUM ('standard', 'vip', 'early_bird', 'group', 'free', 'donation');

-- 3. PROFILES (Extension de auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  name TEXT,
  avatar TEXT,
  role user_role DEFAULT 'USER',
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sécurité Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can do everything on profiles" ON profiles FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);

-- 4. EVENTS
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  organizer_id UUID REFERENCES profiles(id), -- Peut être null si créé par un admin direct
  organizer_name TEXT DEFAULT 'AfriTix Event', -- Fallback name
  
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  
  location TEXT,
  city TEXT,
  country TEXT,
  coordinates JSONB, -- { lat: number, lng: number }
  
  price NUMERIC DEFAULT 0, -- Prix d'appel (le plus bas)
  currency TEXT DEFAULT 'FCFA',
  
  image TEXT,
  gallery TEXT[], -- Array of URLs
  category TEXT,
  
  sold INTEGER DEFAULT 0,
  capacity INTEGER DEFAULT 1000,
  
  program JSONB, -- Array of {time, title, description}
  status event_status DEFAULT 'draft'
);

-- Sécurité Events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published events are viewable by everyone" ON events FOR SELECT USING (status = 'published');
CREATE POLICY "Organizers can view own events" ON events FOR SELECT USING (auth.uid() = organizer_id);
CREATE POLICY "Organizers can insert events" ON events FOR INSERT WITH CHECK (auth.uid() = organizer_id);
CREATE POLICY "Organizers can update own events" ON events FOR UPDATE USING (auth.uid() = organizer_id);

-- 5. TICKET TYPES (Catégories de billets)
CREATE TABLE ticket_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL, -- Stock initial
  sold INTEGER DEFAULT 0,
  type ticket_type_enum DEFAULT 'standard',
  features TEXT[] -- Array of strings
);

-- Sécurité Ticket Types
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ticket types are public" ON ticket_types FOR SELECT USING (true);

-- 6. TRANSACTIONS
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  event_id UUID REFERENCES events(id),
  user_id UUID REFERENCES auth.users(id), -- Null si Guest
  guest_email TEXT,
  guest_name TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'XOF',
  method TEXT, -- 'WAVE', 'OM', 'CB'
  status TEXT DEFAULT 'pending' -- 'completed', 'failed'
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);

-- 7. TICKETS (Billets générés)
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  transaction_id UUID REFERENCES transactions(id),
  event_id UUID REFERENCES events(id),
  ticket_type_id UUID REFERENCES ticket_types(id),
  qr_code TEXT UNIQUE, -- Hash unique pour le scan
  holder_name TEXT,
  holder_email TEXT,
  status TEXT DEFAULT 'valid', -- 'valid', 'checked_in'
  checked_in_at TIMESTAMPTZ
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own tickets" ON tickets FOR SELECT USING (
  transaction_id IN (SELECT id FROM transactions WHERE user_id = auth.uid())
);

-- ==========================================
-- DATA SEEDING (Données de test)
-- ==========================================

-- Insérer des événements
INSERT INTO events (id, title, date, location, city, country, price, image, category, status, description, sold, capacity, program, gallery)
VALUES 
(
  'b49a5621-0302-40bb-8025-055547610111',
  'Festival Afrobeat Abidjan 2024',
  '2024-12-15 18:00:00+00',
  'Palais de la Culture',
  'Abidjan',
  'Côte d''Ivoire',
  15000,
  'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2070&auto=format&fit=crop',
  'Concert',
  'published',
  'Le plus grand festival de musique urbaine de l''année revient pour sa 5ème édition.',
  4500,
  5000,
  '[{"time": "18:00", "title": "Ouverture", "description": "DJ Set"}, {"time": "22:00", "title": "Concert", "description": "Magic System"}]'::jsonb,
  ARRAY['https://images.unsplash.com/photo-1533174072545-e8d4aa97edf9?q=80&w=2070']
),
(
  'b49a5621-0302-40bb-8025-055547610222',
  'Dakar Tech Summit',
  '2024-11-20 09:00:00+00',
  'King Fahd Palace',
  'Dakar',
  'Sénégal',
  50000,
  'https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2070',
  'Conférence',
  'published',
  'Le rendez-vous incontournable de l''écosystème tech ouest-africain.',
  850,
  1000,
  '[{"time": "09:00", "title": "Keynote", "description": "Fintech Future"}]'::jsonb,
  NULL
);

-- Insérer les types de billets pour l'événement 1
INSERT INTO ticket_types (event_id, name, price, quantity, type, features)
VALUES 
('b49a5621-0302-40bb-8025-055547610111', 'Standard', 15000, 1000, 'standard', ARRAY['Accès pelouse']),
('b49a5621-0302-40bb-8025-055547610111', 'VIP Gold', 50000, 200, 'vip', ARRAY['Accès Carré Or', 'Champagne']);

-- Insérer les types de billets pour l'événement 2
INSERT INTO ticket_types (event_id, name, price, quantity, type, features)
VALUES 
('b49a5621-0302-40bb-8025-055547610222', 'Pass Pro', 50000, 500, 'standard', ARRAY['Accès Conférences', 'Networking']);

