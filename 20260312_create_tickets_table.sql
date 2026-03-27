-- Creation of the "tickets" table to support centralized backup and revocation
-- This table is populated asynchronously to preserve the "offline-first" checkout speed.

CREATE TABLE IF NOT EXISTS public.tickets (
  id text PRIMARY KEY, -- We use text to support the 'tix-12345678' format generated locally
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  guest_name text,
  guest_email text,
  ticket_type text,
  status text DEFAULT 'valid', -- Can be updated to 'revoked', 'scanned', 'transferred'
  qr_code text, -- Stores the encrypted JWS token
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Quick policy if you have Row Level Security enabled (Optional but recommended)
-- ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable read access for all users" ON public.tickets FOR SELECT USING (true);
-- CREATE POLICY "Enable insert for authenticated users only" ON public.tickets FOR INSERT WITH CHECK (auth.role() = 'authenticated');
