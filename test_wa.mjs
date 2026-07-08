import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://supabasekong-pb8ykq5lxueompxiu9p5ust2.51.255.162.88.sslip.io';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MzUxNDgyMCwiZXhwIjo0OTM5MTg4NDIwLCJyb2xlIjoiYW5vbiJ9.Jckb-tWy6_BmNXv1VJswhBxcxdIlpFiD5rl4GZKC_Ec';
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
