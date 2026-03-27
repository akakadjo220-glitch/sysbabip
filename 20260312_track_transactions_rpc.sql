-- Migrations pour tracker proprement les transactions et le nombre de billets vendus ("sold")

-- 1. RPC pour incrémenter le nombre de billets vendus d'un événement
CREATE OR REPLACE FUNCTION increment_event_sold(evt_id UUID, amount INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE events
  SET sold = sold + amount
  WHERE id = evt_id;
END;
$$;

-- 2. RPC pour incrémenter le nombre de billets vendus d'un type de billet spécifique
CREATE OR REPLACE FUNCTION increment_ticket_type_sold(tt_id UUID, amount INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ticket_types
  SET sold = sold + amount
  WHERE id = tt_id;
END;
$$;
