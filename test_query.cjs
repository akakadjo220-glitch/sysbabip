require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://supabasekong-pb8ykq5lxueompxiu9p5ust2.51.255.162.88.sslip.io';
const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MzUxNDgyMCwiZXhwIjo0OTM5MTg4NDIwLCJyb2xlIjoiYW5vbiJ9.Jckb-tWy6_BmNXv1VJswhBxcxdIlpFiD5rl4GZKC_Ec';

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
