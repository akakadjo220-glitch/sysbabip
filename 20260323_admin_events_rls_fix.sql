-- server/20260323_admin_events_rls_fix.sql
-- Allow ADMINs to do all operations on the events table

-- Safely drop all existing potential admin policies on events table to avoid conflicts
DROP POLICY IF EXISTS "Admins can view all events" ON events;
DROP POLICY IF EXISTS "Admins can update all events" ON events;
DROP POLICY IF EXISTS "Admins can delete events" ON events;
DROP POLICY IF EXISTS "Admins can do all on events" ON events;

-- Master policy for Admins
CREATE POLICY "Admins can do all on events" ON events 
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);
