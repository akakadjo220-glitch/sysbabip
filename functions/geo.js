// Pays (et ville approximative) du visiteur, déduits par Cloudflare de son
// adresse IP : aucune demande d'autorisation, aucun service tiers, rien stocké ici.
// Sert à afficher le bon pays à l'accueil et à préremplir le paiement.
export const onRequestGet = ({ request }) => {
  const cf = request.cf || {};
  const lat = Number(cf.latitude);
  const lng = Number(cf.longitude);
  return new Response(JSON.stringify({
    country: cf.country || null,
    city: cf.city || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
};
