const fs = require('fs');

async function check() {
  const envFile = fs.readFileSync('../.env.local', 'utf-8');
  let url = '';
  let key = '';
  envFile.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
  });

  console.log('Fetching...');
  const res = await fetch(`${url}/rest/v1/fundraising_campaigns?select=*`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });

  const body = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', body);
}

check();
