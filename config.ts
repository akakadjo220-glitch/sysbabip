// Configuration centralisée pour le Frontend (Babipass)

export const SUPABASE_URL = 
  import.meta.env.VITE_SUPABASE_URL || 
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://supabasekong-pb8ykq5lxueompxiu9p5ust2.51.255.162.88.sslip.io';

export const SUPABASE_ANON_KEY = 
  import.meta.env.VITE_SUPABASE_ANON_KEY || 
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MzUxNDgyMCwiZXhwIjo0OTM5MTg4NDIwLCJyb2xlIjoiYW5vbiJ9.Jckb-tWy6_BmNXv1VJswhBxcxdIlpFiD5rl4GZKC_Ec';

// URL du serveur backend (Node.js/Express)
// En production sur Coolify, cette URL sera lue depuis les variables d'environnement.
export const SERVER_URL = 
  import.meta.env.VITE_SERVER_URL || 
  import.meta.env.NEXT_PUBLIC_SERVER_URL || 
  'http://b48akzszflzxiselelieqfdr.51.255.162.88.sslip.io'; // Sera écrasé par la variable VITE_SERVER_URL sur Cloudflare/Coolify
