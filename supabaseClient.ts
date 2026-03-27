
import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io';
export const supabaseAnonKey = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTUwMzM2MCwiZXhwIjo0OTI3MTc2OTYwLCJyb2xlIjoiYW5vbiJ9.s0AAg10GbSOn_-7RfJpnJcHNJLCEb6yzkHsKxUhz-tI';

// Client unique Supabase — NE PAS créer de deuxième instance createClient()
// Cela causerait une erreur "Multiple GoTrueClient instances" qui casse les sessions
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
