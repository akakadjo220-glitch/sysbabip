require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(process.env.VITE_SUPABASE_URL || 'https://supabasekong-pb8ykq5lxueompxiu9p5ust2.51.255.162.88.sslip.io', process.env.VITE_SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MzUxNDgyMCwiZXhwIjo0OTM5MTg4NDIwLCJyb2xlIjoiYW5vbiJ9.Jckb-tWy6_BmNXv1VJswhBxcxdIlpFiD5rl4GZKC_Ec');

supabase.from('platform_settings').select('value').eq('key', 'wa_config').single().then(res => {
    const waConfig = res.data.value;
    console.log('Providers:', waConfig.provider);

    const postData = JSON.stringify({
        number: '2250544246972',
        message: 'Babipass: Test de notification système.',
        type: 'text'
    });

    const options = {
        hostname: 'wasenderapi.com',
        path: '/api/send-message?instance_id=' + waConfig.instanceId,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + waConfig.token,
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = https.request(options, (response) => {
        let body = '';
        response.on('data', d => body += d);
        response.on('end', () => console.log('Response:', response.statusCode, body));
    });

    req.on('error', e => console.error('Fetch error:', e));
    req.write(postData);
    req.end();
}).catch(console.error);
