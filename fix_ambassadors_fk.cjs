const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: "postgresql://postgres.l4cw40oks4kso84ko44ogkkw:Babipass2024!@188.241.58.227:5432/postgres"
    });
    try {
        await client.connect();
        await client.query(`
            ALTER TABLE public.ambassador_links DROP CONSTRAINT IF EXISTS fk_ambassador_links_profile;
            ALTER TABLE public.ambassador_links ADD CONSTRAINT fk_ambassador_links_profile FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
            
            ALTER TABLE public.ambassador_withdrawals DROP CONSTRAINT IF EXISTS fk_ambassador_withdrawals_profile;
            ALTER TABLE public.ambassador_withdrawals ADD CONSTRAINT fk_ambassador_withdrawals_profile FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
        `);
        console.log("FK added successfully!");
    } catch (err) {
        console.error("Migration Error:", err);
    } finally {
        await client.end();
    }
}
run();
