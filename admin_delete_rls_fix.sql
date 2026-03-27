-- admin_delete_rls_fix.sql
-- Fixes RLS policies to allow Admins to delete events and cascade-delete related records.

-- 1. Events: Allow ADMIN to delete events
CREATE POLICY "Admins can delete events" ON public.events 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);

-- 2. Tickets: Allow ADMIN to delete tickets
CREATE POLICY "Admins can delete tickets" ON public.tickets 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);

-- 3. Transactions: Allow ADMIN to delete transactions
CREATE POLICY "Admins can delete transactions" ON public.transactions 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);

-- 4. Ticket Types: Allow ADMIN to delete ticket types
CREATE POLICY "Admins can delete ticket types" ON public.ticket_types 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);

-- 5. Event Programs: Allow ADMIN to delete event programs
CREATE POLICY "Admins can delete event programs" ON public.event_programs 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);
