-- migrations/20260317_fix_payout_requests_rls_v2.sql

-- Drop existing admin policy if it exists
DROP POLICY IF EXISTS "Admins can view and update all payout requests" ON payout_requests;

-- Create a more robust policy for Admins with explicit casting of role enum to text
CREATE POLICY "Admins can view and update all payout requests" 
ON payout_requests FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.role::text = 'ADMIN') -- Explicit cast to text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.role::text = 'ADMIN') -- Explicit cast to text
  )
);

-- Ensure RLS is enabled
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
