const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing fundraising_campaigns access...');
  const { data, error } = await supabase.from('fundraising_campaigns').select('*');
  console.log('Data:', data);
  console.log('Error:', error);
  
  if (error) {
     console.log('Maybe the table does not exist?');
  } else {
     console.log(`There are ${data.length} campaigns visible to ANON key.`);
  }

  // Let's also test via an ADMIN user if we can.
  // We can't easily masquerade as admin unless we have the service role key.
  // Do we have the service role key? Let's check .env.local
}
test();
