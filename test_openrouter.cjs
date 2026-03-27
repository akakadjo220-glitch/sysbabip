const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTUwMzM2MCwiZXhwIjo0OTI3MTc2OTYwLCJyb2xlIjoiYW5vbiJ9.s0AAg10GbSOn_-7RfJpnJcHNJLCEb6yzkHsKxUhz-tI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
    const { data, error } = await supabase.from('platform_settings').select('value').eq('key', 'openrouter_api_key').single();
    if(error) return console.log('Supabase Error:', error);
    
    const token = data.value;
    console.log('Got token:', token.substring(0, 10) + '...');
    
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            model: 'qwen/qwen3.5-9b',
            messages: [{role: 'user', content: 'bonjour'}]
        })
    });
    const d = await res.json();
    console.log('OpenRouter Response:', JSON.stringify(d, null, 2));
}
test();
