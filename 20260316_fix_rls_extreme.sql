-- ============================================================
-- FIX: Extreme RLS Performance & Optimization
-- Replaces all subqueries with EXISTS and adds missing indexes.
-- ============================================================

-- 1. Refine the role-checking function (mark as STABLE for performance)
CREATE OR REPLACE FUNCTION public.check_user_role(target_uid UUID, target_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = target_uid AND role::text = target_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Optimize ALL existing policies to avoid IN (SELECT ...)
-- Tickets table
DROP POLICY IF EXISTS "Users see own tickets" ON tickets;
CREATE POLICY "Users see own tickets" ON tickets FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.transactions 
    WHERE transactions.id = tickets.transaction_id 
    AND transactions.user_id = auth.uid()
  )
);

-- Profiles table (Ensure Admin check is fast)
DROP POLICY IF EXISTS "Admins see all profiles" ON profiles;
CREATE POLICY "Admins see all profiles" ON profiles FOR ALL USING (check_user_role(auth.uid(), 'ADMIN'));

-- 3. Consolidate and Optimize Organizer Policies
-- Transactions
DROP POLICY IF EXISTS "Organizers see transactions for own events" ON transactions;
CREATE POLICY "Organizers see transactions for own events" ON transactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = transactions.event_id 
    AND events.organizer_id = auth.uid()
  )
);

-- Tickets
DROP POLICY IF EXISTS "Organizers see tickets for own events" ON tickets;
CREATE POLICY "Organizers see tickets for own events" ON tickets FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = tickets.event_id 
    AND events.organizer_id = auth.uid()
  )
);

-- 4. MISSING INDEXES (Crucial for JOIN performance)
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_transaction_id ON tickets(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_events_organizer_id ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 5. Force statistics update for the optimizer
ANALYZE events;
ANALYZE transactions;
ANALYZE tickets;
ANALYZE profiles;
