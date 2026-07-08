require('dotenv').config();
const url = process.env.VITE_SUPABASE_URL || 'https://supabasekong-pb8ykq5lxueompxiu9p5ust2.51.255.162.88.sslip.io';
const key = process.env.VITE_SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MzUxNDgyMCwiZXhwIjo0OTM5MTg4NDIwLCJyb2xlIjoiYW5vbiJ9.Jckb-tWy6_BmNXv1VJswhBxcxdIlpFiD5rl4GZKC_Ec';

async function check() {
  console.log('Fetching fundraising_campaigns...');
  try {
    const res = await fetch(`${url}/rest/v1/fundraising_campaigns?select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    const body = await res.text();
    console.log('Status REST:', res.status);
    console.log('Body REST:', body);
  } catch (err) {
    console.log('Error REST:', err.message);
  }

  console.log('\nFetching events...');
  try {
    const res2 = await fetch(`${url}/rest/v1/events?status=eq.pending_review&select=id,title,status`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    const body2 = await res2.text();
    console.log('Status REST Events:', res2.status);
    console.log('Body REST Events:', body2);
  } catch (err) {
    console.log('Error REST:', err.message);
  }
}

check();
