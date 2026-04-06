import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const {data: events, error} = await supabase.from('events').select('*').eq('status', 'published').order('date', { ascending: true });
  console.log('Events Data:', events ? events.length : 'null');
  
  if (events) {
    const eventIds = events.map(e => e.id);
    console.log('eventIds:', eventIds.slice(0,3));
    const { data: tts, error: ttErr } = await supabase
      .from('ticket_types')
      .select('id, event_id, name, price, capacity, sold')
      .in('event_id', eventIds);
    console.log('TTS:', tts ? tts.length : 'null');
    console.log('TTS Error:', ttErr);
  }
}

run();
