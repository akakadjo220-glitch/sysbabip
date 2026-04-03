CREATE TABLE IF NOT EXISTS public.ticket_transfers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    old_ticket_id text NOT NULL,
    new_ticket_id text NOT NULL,
    recipient_name text NOT NULL,
    recipient_contact text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RPC for securely transferring a ticket
CREATE OR REPLACE FUNCTION public.transfer_ticket(
    p_ticket_id text,
    p_new_name text,
    p_new_contact text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_ticket public.tickets%ROWTYPE;
    v_new_ticket_id text;
BEGIN
    -- 1. Get the current ticket
    SELECT * INTO v_old_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Billet introuvable');
    END IF;

    IF v_old_ticket.status != 'valid' THEN
        RETURN json_build_object('success', false, 'error', 'Le billet n''est plus valide ou a déjà été utilisé/transféré');
    END IF;

    -- 2. Mark old ticket as transferred
    UPDATE public.tickets
    SET status = 'transferred'
    WHERE id = p_ticket_id;

    -- 3. Create the new ticket ID (format: tix-timestamp-random)
    v_new_ticket_id := 'tix-trsf-' || floor(extract(epoch from now()))::text || '-' || floor(random() * 10000)::text;

    -- 4. Insert the new ticket
    -- qr_code will be updated by the frontend/backend when generating the JWS securely
    INSERT INTO public.tickets (
        id, event_id, transaction_id, guest_name, guest_email, ticket_type, status, qr_code
    ) VALUES (
        v_new_ticket_id,
        v_old_ticket.event_id,
        v_old_ticket.transaction_id,
        p_new_name,
        p_new_contact,
        v_old_ticket.ticket_type,
        'valid',
        NULL 
    );

    -- 5. Track the transfer
    INSERT INTO public.ticket_transfers (
        old_ticket_id, new_ticket_id, recipient_name, recipient_contact
    ) VALUES (
        p_ticket_id, v_new_ticket_id, p_new_name, p_new_contact
    );

    RETURN json_build_object(
        'success', true,
        'new_ticket_id', v_new_ticket_id,
        'event_id', v_old_ticket.event_id,
        'ticket_type', v_old_ticket.ticket_type
    );
END;
$$;
