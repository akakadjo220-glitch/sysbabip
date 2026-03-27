const { Client } = require('pg');
const fs = require('fs');

async function run() {
    const client = new Client({
        connectionString: "postgresql://postgres.l4cw40oks4kso84ko44ogkkw:Babipass2024!@188.241.58.227:5432/postgres"
    });
    try {
        await client.connect();
        const sql = fs.readFileSync('server/20260326_cancellation_refunds.sql', 'utf8');
        await client.query(sql);
        console.log("SQL Migration executed successfully!");
    } catch (err) {
        console.error("Migration Error:", err);
    } finally {
        await client.end();
    }
}
run();
