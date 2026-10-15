// Pays du visiteur, détecté par Cloudflare (aucune donnée personnelle stockée).
// Sert à afficher directement les événements du bon pays à la première visite.
export const onRequestGet = ({ request }) =>
  new Response(JSON.stringify({ country: request.cf?.country || null }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
