-- ============================================================
-- FIX: RLS Recursion & Performance
-- This script fixes circular policies that cause the 10s hang.
-- ============================================================

-- 1. Create a helper function to bypass RLS loops
-- This function runs as the owner (bypassing RLS)
CREATE OR REPLACE FUNCTION public.check_user_role(target_uid UUID, target_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = target_uid AND role::text = target_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Cleanup old offending policies
DROP POLICY IF EXISTS "Admins can do everything on profiles" ON profiles;
DROP POLICY IF EXISTS "Admins see all transactions" ON transactions;
DROP POLICY IF EXISTS "Admins see all tickets" ON tickets;
DROP POLICY IF EXISTS "Organizers see transactions for own events" ON transactions;
DROP POLICY IF EXISTS "Organizers see tickets for own events" ON tickets;

-- 3. Simplified Profile access for Admins (Non-recursive)
CREATE POLICY "Admins see all profiles"
  ON profiles FOR ALL
  USING (check_user_role(auth.uid(), 'ADMIN'));

-- 4. Fixed Transaction access for Admins & Organizers
CREATE POLICY "Admins see all transactions"
  ON transactions FOR SELECT
  USING (check_user_role(auth.uid(), 'ADMIN'));

CREATE POLICY "Organizers see transactions for own events"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = transactions.event_id 
      AND events.organizer_id = auth.uid()
    )
  );

-- 5. Fixed Ticket access for Admins & Organizers
CREATE POLICY "Admins see all tickets"
  ON tickets FOR SELECT
  USING (check_user_role(auth.uid(), 'ADMIN'));

CREATE POLICY "Organizers see tickets for own events"
  ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = tickets.event_id 
      AND events.organizer_id = auth.uid()
    )
  );

-- 6. Optimization: Ensure indexes exist for lookups
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_event ON transactions(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);

GRANT EXECUTE ON FUNCTION public.check_user_role(UUID, TEXT) TO authenticated;
