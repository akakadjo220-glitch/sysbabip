const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing fundraising_campaigns access...');
  const { data, error } = await supabase.from('fundraising_campaigns').select('*');
  console.log('Data count:', data ? data.length : 0);
  console.log('Error:', error);
}
test();
