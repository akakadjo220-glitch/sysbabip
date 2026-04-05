-- Replaces the verify_organizer RPC to automatically set the Admin-level 'status' field to 'active'
-- when Didit confirms identity. Otherwise, leaves the status as 'pending' or whatever it currently is.
CREATE OR REPLACE FUNCTION public.verify_organizer(
    p_user_id UUID,
    p_status TEXT
) RETURNS void AS $$
BEGIN
    UPDATE profiles
    SET didit_status = p_status,
        is_verified = (p_status = 'verified'),
        status = CASE WHEN p_status = 'verified' THEN 'active' ELSE status END
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
