const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let envStr = '';
try { envStr = fs.readFileSync('.env', 'utf8'); } catch (e) { }
const env = envStr.split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k) acc[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabaseUrl = env['VITE_SUPABASE_URL'] || process.env.VITE_SUPABASE_URL;
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'] || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.log("No supabase url found");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('ambassador_withdrawals').select('*, profiles:user_id(name, email)').order('created_at', { ascending: false });
  console.log('DATA:', JSON.stringify(data, null, 2));
  if (error) console.log('ERROR:', JSON.stringify(error, null, 2));
}

run();
