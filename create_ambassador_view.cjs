const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });
    try {
        await client.connect();
        await client.query(`
            CREATE OR REPLACE VIEW ambassador_stats_view AS
            SELECT 
                user_id,
                SUM(sales) as total_sales,
                SUM(clicks) as total_clicks,
                SUM(earned_amount) as total_earned,
                COUNT(DISTINCT event_id) as events_count,
                MAX(created_at) as last_activity
            FROM ambassador_links
            GROUP BY user_id;
        `);
        console.log("SQL View created successfully!");
    } catch (err) {
        console.error("View Creation Error:", err);
    } finally {
        await client.end();
    }
}
run();
