const { createClient } = require('@supabase/supabase-js');

const VITE_SUPABASE_URL = 'https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io';
const VITE_SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTUwMzM2MCwiZXhwIjo0OTI3MTc2OTYwLCJyb2xlIjoiYW5vbiJ9.s0AAg10GbSOn_-7RfJpnJcHNJLCEb6yzkHsKxUhz-tI';

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log("Searching for: akacharle2@gmail.com");
  const { data, error } = await supabase
    .from('tickets')
    .select('*, events(title, date, location, city, profiles:organizer_id(name, avatar))')
    .eq('guest_email', 'akacharle2@gmail.com');

  if (error) {
    console.error("Supabase Error:", error);
  } else {
    console.log("Found Records:", data.length);
    console.log(JSON.stringify(data, null, 2));
  }
}

test();
