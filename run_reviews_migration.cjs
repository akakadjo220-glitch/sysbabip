const { Client } = require('pg');
const fs = require('fs');

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });
    try {
        await client.connect();
        console.log("Connected to database.");
        const sql = fs.readFileSync('20260407_real_reviews_system.sql', 'utf8');
        await client.query(sql);
        console.log("✅ Reviews migration executed successfully!");
    } catch (err) {
        console.error("❌ Migration Error:", err.message);
    } finally {
        await client.end();
    }
}
run();
