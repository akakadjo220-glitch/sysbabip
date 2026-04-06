const { Client } = require('pg');
const fs = require('fs');

async function run() {
    const client = new Client({
        connectionString: "postgresql://postgres.l4cw40oks4kso84ko44ogkkw:Babipass2024!@188.241.58.227:5432/postgres"
    });
    try {
        await client.connect();
        const sql = `
CREATE OR REPLACE VIEW admin_event_payouts_view AS
WITH global_config AS (
  SELECT (value->>0)::NUMERIC as digital_rate 
  FROM platform_settings WHERE key = 'default_commission_rate'
),
event_rev AS (
  SELECT 
    e.id AS event_id,
    e.title AS event_title,
    COALESCE(e.organizer_name, 'Organisateur') AS organizer_name,
    e.date AS event_date,
    COALESCE(SUM(t.amount), 0) AS revenue,
    COALESCE(SUM(t.ambassador_commission), 0) AS ambassador_commission
  FROM events e
  LEFT JOIN transactions t ON t.event_id = e.id AND t.status = 'completed'
  GROUP BY e.id, e.title, e.organizer_name, e.date
),
event_advances AS (
  SELECT 
    event_id,
    COALESCE(SUM(amount) FILTER (WHERE type = 'cash_advance'), 0) AS cash_advance,
    COALESCE(SUM(amount) FILTER (WHERE type = 'physical_commission'), 0) AS physical_compensation,
    COALESCE(SUM(amount), 0) AS advance_deducted
  FROM payout_requests
  WHERE status IN ('paid', 'approved', 'pending')
    AND type IN ('cash_advance', 'physical_commission')
  GROUP BY event_id
)
SELECT 
  er.event_id,
  er.event_title,
  er.organizer_name,
  er.event_date,
  er.revenue,
  (er.revenue * (COALESCE((SELECT digital_rate FROM global_config), 8.0) / 100.0)) AS commission,
  er.ambassador_commission,
  COALESCE(ea.cash_advance, 0) AS cash_advance,
  COALESCE(ea.physical_compensation, 0) AS physical_compensation,
  COALESCE(ea.advance_deducted, 0) AS advance_deducted,
  (er.revenue * (1 - (COALESCE((SELECT digital_rate FROM global_config), 8.0) / 100.0))) 
    - er.ambassador_commission 
    - COALESCE(ea.advance_deducted, 0) AS payout_amount
FROM event_rev er
LEFT JOIN event_advances ea ON er.event_id = ea.event_id;
        `;
        await client.query(sql);
        console.log("SQL View created successfully!");
    } catch (err) {
        console.error("View Error:", err);
    } finally {
        await client.end();
    }
}
run();
