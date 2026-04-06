const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: "postgresql://postgres.l4cw40oks4kso84ko44ogkkw:Babipass2024!@188.241.58.227:5432/postgres" // I will use the external server
    });
    try {
        await client.connect();
        const res = await client.query(`SELECT email, role FROM profiles WHERE role = 'admin' LIMIT 5;`);
        console.table(res.rows);
    } catch (err) {
        console.error("View Error:", err);
    } finally {
        await client.end();
    }
}
run();
