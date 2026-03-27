-- RPC pour agréger le CA par pays pour le graphique Vue d'ensemble
CREATE OR REPLACE FUNCTION get_revenue_by_country()
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(json_build_object('name', country, 'value', revenue))
  INTO result
  FROM (
    SELECT COALESCE(e.country, 'Inconnu') as country, SUM(t.amount) as revenue
    FROM transactions t
    JOIN events e ON t.event_id = e.id
    WHERE t.status = 'completed'
    GROUP BY COALESCE(e.country, 'Inconnu')
  ) subq;
  
  RETURN COALESCE(result, '[]');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC pour agréger le cash collecté par les agents (Guichets)
CREATE OR REPLACE FUNCTION get_agent_cash_stats()
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(json_build_object(
    'id', a.id,
    'name', a.name,
    'role', a.role,
    'lastActive', COALESCE(a.last_active_at, a.created_at),
    'cashCollected', COALESCE(cash.collected, 0)
  ))
  INTO result
  FROM agents a
  LEFT JOIN (
    SELECT agent_id, SUM(amount) as collected
    FROM transactions
    WHERE is_cash = true AND status = 'completed' AND agent_id IS NOT NULL
    GROUP BY agent_id
  ) cash ON cash.agent_id = a.id;
  
  RETURN COALESCE(result, '[]');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
