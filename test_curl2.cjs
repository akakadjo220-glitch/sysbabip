const url = 'https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io';
const key = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTUwMzM2MCwiZXhwIjo0OTI3MTc2OTYwLCJyb2xlIjoiYW5vbiJ9.s0AAg10GbSOn_-7RfJpnJcHNJLCEb6yzkHsKxUhz-tI';

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
