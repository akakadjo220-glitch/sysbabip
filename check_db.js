require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUri = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUri, supabaseKey);

async function check() {
  console.log('Checking fundraising_campaigns...');
  const { data: fc, error: fcErr } = await supabase.from('fundraising_campaigns').select('*');
  console.log('Campaigns:', fc, fcErr);

  console.log('\nChecking events (status pending_review)...');
  const { data: ev, error: evErr } = await supabase.from('events').select('id, title, status').eq('status', 'pending_review');
  console.log('Events (pending_review):', ev, evErr);
}

check();
