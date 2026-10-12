const { Client } = require('pg');
const fs = require('fs');

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL // Note: the previous attempt timed out here? Let's check if the port is open externally. Wait! I can't use node pg if it's closed externally!
    });
    try {
        await client.connect();
        const sql = fs.readFileSync('server/20260404_auth_users_info.sql', 'utf8');
        await client.query(sql);
        console.log("SQL Migration executed successfully!");
    } catch (err) {
        console.error("Migration Error:", err);
    } finally {
        await client.end();
    }
}
run();
