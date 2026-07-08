
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;

// Client unique Supabase — NE PAS créer de deuxième instance createClient()
// Cela causerait une erreur "Multiple GoTrueClient instances" qui casse les sessions
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
