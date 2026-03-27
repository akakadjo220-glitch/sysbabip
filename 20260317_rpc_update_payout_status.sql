-- migrations/20260317_rpc_update_payout_status.sql

-- Create an RPC to update payout status, bypassing RLS using SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_payout_status(
  p_request_id UUID,
  p_new_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- This bypasses RLS
AS $$
DECLARE
  v_admin_count INT;
  v_updated_id UUID;
BEGIN
  -- 1. Check if caller is authenticated
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  -- 2. Check if caller is ADMIN
  SELECT count(*) INTO v_admin_count FROM profiles 
  WHERE id = auth.uid() AND role::text ILIKE 'admin';

  IF v_admin_count = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Accès refusé. Vous n''êtes pas administrateur.');
  END IF;

  -- 3. Perform the update
  UPDATE payout_requests
  SET 
    status = p_new_status::payout_status,
    resolved_at = CASE WHEN p_new_status = 'paid' THEN NOW() ELSE resolved_at END,
    resolved_by = auth.uid()
  WHERE id = p_request_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Demande non trouvée ou mise à jour échouée.');
  END IF;

  RETURN json_build_object('success', true, 'id', v_updated_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.update_payout_status(UUID, TEXT) TO authenticated;
