const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient('https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTUwMzM2MCwiZXhwIjo0OTI3MTc2OTYwLCJyb2xlIjoiYW5vbiJ9.s0AAg10GbSOn_-7RfJpnJcHNJLCEb6yzkHsKxUhz-tI');

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
