const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: false
    });
    try {
        await client.connect();

        // Add status column if it doesn't exist
        await client.query(`
            ALTER TABLE events 
            ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'published';
        `);
        console.log("✅ Column 'status' added to events");

        // Mark past events (ended more than 24h ago) as completed
        await client.query(`
            UPDATE events 
            SET status = 'completed' 
            WHERE date::timestamp + interval '24 hours' < now()
            AND (status IS NULL OR status = 'published');
        `);
        console.log("✅ Past events marked as 'completed'");

        // Ensure remaining nulls are 'published'
        await client.query(`
            UPDATE events 
            SET status = 'published' 
            WHERE status IS NULL;
        `);
        console.log("✅ All other events set to 'published'");

    } catch (err) {
        console.error("❌ Migration Error:", err.message);
    } finally {
        await client.end();
    }
}
run();
