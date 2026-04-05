const { createClient } = require('@supabase/supabase-js');
<<<<<<< HEAD
require('dotenv').config({ path: '.env.local' });
=======
require('dotenv').config({ path: '../.env.local' });
>>>>>>> 1bcac3a17a4590d9fb81456d3b4ed55eabf3124a

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing fundraising_campaigns access...');
  const { data, error } = await supabase.from('fundraising_campaigns').select('*');
<<<<<<< HEAD
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
=======
  console.log('Data count:', data ? data.length : 0);
  console.log('Error:', error);
>>>>>>> 1bcac3a17a4590d9fb81456d3b4ed55eabf3124a
}
test();
