const { Client } = require('pg');
const fs = require('fs');

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
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
