const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: "postgresql://postgres.l4cw40oks4kso84ko44ogkkw:Babipass2024!@188.241.58.227:5432/postgres"
    });
    try {
        await client.connect();
        await client.query("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'AMBASSADOR';");
        console.log("SQL Migration for AMBASSADOR role executed successfully!");
    } catch (err) {
        console.error("Migration Error:", err);
    } finally {
        await client.end();
    }
}
run();
