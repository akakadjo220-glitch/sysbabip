import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io';
const supabaseKey = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTUwMzM2MCwiZXhwIjo0OTI3MTc2OTYwLCJyb2xlIjoiYW5vbiJ9.s0AAg10GbSOn_-7RfJpnJcHNJLCEb6yzkHsKxUhz-tI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testWA() {
    try {
        const { data: configData } = await supabase.from('platform_settings').select('value').eq('key', 'wa_config').single();
        const waConfig = configData.value;
        const payload = {
            message: 'Babipass Media Test',
        };

        const res = await fetch(`https://wasenderapi.com/api/send-message?instance_id=${waConfig.instanceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${waConfig.token}`
            },
            body: JSON.stringify(payload)
        });

        const j = await res.json();
        console.log('Response Status:', res.status);
        console.log('Response Body:', j);

    } catch (e) {
        console.error('Error:', e);
    }
}

testWA();
