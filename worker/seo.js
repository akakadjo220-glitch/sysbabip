/**
 * Babipass — aperçus de partage et sitemap, servis par Cloudflare Pages Functions
 * (voir functions/event/[slug].js, functions/collecte/[slug].js,
 * functions/tournoi/[slug].js, functions/sitemap.xml.js).
 *
 * WhatsApp, Facebook, X… ne lancent pas le JavaScript du site : sans cela, tout
 * lien partagé affiche l'aperçu générique de Babipass. Pour les pages événement,
 * cagnotte et tournoi, on renvoie le même index.html avec le titre, la
 * description et l'affiche de la page, plus les données structurées « Event »
 * pour Google. /sitemap.xml est généré à partir de la base.
 *
 * Règle d'or : si quoi que ce soit échoue (API lente, page inconnue), on sert
 * l'index.html normal. Ce code ne doit jamais empêcher le site de s'afficher.
 */

const SITE = 'https://babipass.com';
const DEFAULT_IMAGE = 'https://insforgeinst.site/images/2026/07/09/log-babipass.png';
const META_TIMEOUT_MS = 1500;
const META_CACHE_S = 300;
const SITEMAP_CACHE_S = 3600;

// Valeurs publiques (déjà présentes dans le code du site) ; surchargeables par
// les variables d'environnement du projet Pages.
const DEFAULTS = {
  API_URL: 'https://api.babipass.com',
  SUPABASE_URL: 'https://supabasekong-pb8ykq5lxueompxiu9p5ust2.51.255.162.88.sslip.io',
  // Clé « anon » publique : lecture de ce que tout visiteur peut voir (RLS).
  SUPABASE_ANON_KEY: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MzUxNDgyMCwiZXhwIjo0OTM5MTg4NDIwLCJyb2xlIjoiYW5vbiJ9.Jckb-tWy6_BmNXv1VJswhBxcxdIlpFiD5rl4GZKC_Ec',
};

function config(env) {
  return {
    API_URL: env?.API_URL || DEFAULTS.API_URL,
    SUPABASE_URL: env?.SUPABASE_URL || DEFAULTS.SUPABASE_URL,
    SUPABASE_ANON_KEY: env?.SUPABASE_ANON_KEY || DEFAULTS.SUPABASE_ANON_KEY,
  };
}

/** Page événement / cagnotte / tournoi : index.html enrichi pour le partage. */
export async function sharePage(kind, context) {
  const { request, env } = context;
  const ctx = { waitUntil: (p) => context.waitUntil(p) };
  const url = new URL(request.url);

  // index.html de l'application (la page elle-même est rendue par React).
  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  if (!shell.ok || !(shell.headers.get('content-type') || '').includes('text/html')) return shell;

  let meta = null;
  try {
    const slug = decodeURIComponent(String(context.params.slug || '')).slice(0, 200);
    meta = slug ? await withTimeout(loadMeta(kind, slug, config(env), ctx), META_TIMEOUT_MS) : null;
  } catch {
    meta = null;
  }
  if (!meta) return shell;

  meta.url = `${SITE}${url.pathname.replace(/\/$/, '')}`;
  const response = rewrite(shell, meta);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-cache'); // comme index.html : toujours la dernière version du site
  return new Response(response.body, { status: 200, headers });
}

/** /sitemap.xml généré à partir de la base. */
export async function sitemapResponse(context) {
  const ctx = { waitUntil: (p) => context.waitUntil(p) };
  try {
    return await sitemap(config(context.env), ctx);
  } catch {
    return new Response('Sitemap temporairement indisponible', { status: 503, headers: { 'Retry-After': '300' } });
  }
}

// ─── Données de la page ─────────────────────────────────────────────────────
async function loadMeta(kind, slug, env, ctx) {
  if (kind === 'event') {
    const data = await cachedJson(`${env.API_URL}/api/public/events/${encodeURIComponent(slug)}`, {}, ctx);
    return data?.event ? eventMeta(data.event) : null;
  }
  if (kind === 'collecte') {
    const rows = await supabaseGet(env, ctx,
      `fundraising_campaigns?slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=title,description,image&limit=1`);
    const c = rows?.[0];
    return c ? {
      title: `${c.title} | Cagnotte Babipass`,
      description: summary(c.description) || `Soutenez « ${c.title} » sur Babipass : contribution sécurisée par Wave, Orange Money, MTN MoMo.`,
      image: imageOrDefault(c.image),
      type: 'website',
    } : null;
  }
  if (kind === 'tournoi') {
    const rows = await supabaseGet(env, ctx,
      `tournaments?slug=eq.${encodeURIComponent(slug)}&select=name,description,logo_url,start_date&limit=1`);
    const t = rows?.[0];
    return t ? {
      title: `${t.name} | Billetterie Babipass`,
      description: summary(t.description) || `Tous les matchs et billets du tournoi « ${t.name} » sur Babipass.`,
      image: imageOrDefault(t.logo_url),
      type: 'website',
    } : null;
  }
  return null;
}

function eventMeta(e) {
  const prices = (e.ticket_types || []).map(t => Number(t.price)).filter(p => Number.isFinite(p));
  const minPrice = prices.length ? Math.min(...prices) : Number(e.price) || 0;
  const currency = currencyCode(e.currency);
  const when = e.date ? formatDateFr(e.date) : '';
  const where = [e.location, e.city].filter(Boolean).join(', ');
  const organizer = e.profiles?.company || e.profiles?.name || e.organizer || 'Babipass';

  const intro = [when, where].filter(Boolean).join(' · ');
  const priceText = minPrice > 0 ? `Billets dès ${formatAmount(minPrice)} ${e.currency || 'FCFA'}` : 'Entrée gratuite';
  const description = [intro, priceText, summary(e.description, 120)].filter(Boolean).join(' — ');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    startDate: e.date,
    ...(e.end_date || e.endDate ? { endDate: e.end_date || e.endDate } : {}),
    eventStatus: e.cancellation_status === 'approved' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: [imageOrDefault(e.image)],
    description: summary(e.description, 300) || e.title,
    location: {
      '@type': 'Place',
      name: e.location || e.city || 'Lieu communiqué sur le billet',
      address: {
        '@type': 'PostalAddress',
        ...(e.city ? { addressLocality: e.city } : {}),
        addressCountry: countryCode(e.country),
      },
      ...(e.coordinates?.lat && e.coordinates?.lng
        ? { geo: { '@type': 'GeoCoordinates', latitude: e.coordinates.lat, longitude: e.coordinates.lng } }
        : {}),
    },
    organizer: { '@type': 'Organization', name: organizer },
    offers: (e.ticket_types?.length ? e.ticket_types : [{ name: 'Billet', price: minPrice }]).map(t => ({
      '@type': 'Offer',
      name: t.name || 'Billet',
      price: Number(t.price) || 0,
      priceCurrency: currency,
      availability: (t.quantity != null && t.sold != null && Number(t.sold) >= Number(t.quantity))
        ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      url: `${SITE}/event/${e.slug || e.id}`,
    })),
  };

  return {
    title: `${e.title} — ${where || 'Billets'} | Babipass`,
    description,
    image: imageOrDefault(e.image),
    type: 'website',
    jsonLd,
  };
}

// ─── Réécriture de index.html ───────────────────────────────────────────────
function rewrite(response, meta) {
  const set = (content) => ({ element(el) { el.setAttribute('content', content); } });
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(meta.title); } })
    .on('meta[name="description"]', set(meta.description))
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', meta.url); } })
    .on('meta[property="og:type"]', set(meta.type))
    .on('meta[property="og:url"]', set(meta.url))
    .on('meta[property="og:title"]', set(meta.title))
    .on('meta[property="og:description"]', set(meta.description))
    .on('meta[property="og:image"]', set(meta.image))
    .on('meta[name="twitter:title"]', set(meta.title))
    .on('meta[name="twitter:description"]', set(meta.description))
    .on('meta[name="twitter:image"]', set(meta.image))
    .on('head', {
      element(el) {
        if (meta.jsonLd) {
          el.append(`<script type="application/ld+json">${safeJson(meta.jsonLd)}</script>`, { html: true });
        }
      },
    })
    .transform(response);
}

// ─── Sitemap ────────────────────────────────────────────────────────────────
async function sitemap(env, ctx) {
  const cache = caches.default;
  const key = new Request(`${SITE}/__sitemap_cache`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const [events, campaigns, tournaments] = await Promise.all([
    supabaseGet(env, ctx, 'events?status=in.(published,completed)&select=slug,id,date,status&order=date.desc&limit=5000'),
    supabaseGet(env, ctx, 'fundraising_campaigns?status=eq.active&select=slug,created_at&limit=2000').catch(() => []),
    supabaseGet(env, ctx, 'tournaments?select=slug,start_date&limit=2000').catch(() => []),
  ]);
  if (!Array.isArray(events)) throw new Error('sitemap: événements indisponibles');

  const urls = [
    { loc: `${SITE}/`, changefreq: 'daily', priority: '1.0' },
    ...(events || []).filter(e => e.slug || e.id).map(e => ({
      loc: `${SITE}/event/${encodeURIComponent(e.slug || e.id)}`,
      changefreq: e.status === 'published' ? 'daily' : 'monthly',
      priority: e.status === 'published' ? '0.9' : '0.4',
    })),
    ...(campaigns || []).filter(c => c.slug).map(c => ({ loc: `${SITE}/collecte/${encodeURIComponent(c.slug)}`, changefreq: 'daily', priority: '0.7' })),
    ...(tournaments || []).filter(t => t.slug).map(t => ({ loc: `${SITE}/tournoi/${encodeURIComponent(t.slug)}`, changefreq: 'weekly', priority: '0.7' })),
    ...['/faq', '/about', '/tickets', '/terms', '/privacy'].map(p => ({ loc: `${SITE}${p}`, changefreq: 'monthly', priority: '0.5' })),
  ];

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(u => `  <url><loc>${xmlEscape(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')
    + '\n</urlset>\n';

  const response = new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${SITEMAP_CACHE_S}` },
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

// ─── Outils ─────────────────────────────────────────────────────────────────
async function cachedJson(url, headers, ctx) {
  const cache = caches.default;
  const key = new Request(url);
  const hit = await cache.match(key);
  if (hit) return hit.json();

  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${META_CACHE_S}` },
  })));
  return data;
}

function supabaseGet(env, ctx, path) {
  // Clé « anon » publique : uniquement ce que tout visiteur peut déjà lire (RLS).
  return cachedJson(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
  }, ctx);
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

function summary(text, max = 160) {
  if (!text) return '';
  const plain = String(text).replace(/<[^>]*>/g, ' ').replace(/[#*_>`~]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

function imageOrDefault(src) {
  return typeof src === 'string' && /^https:\/\//.test(src) ? src : DEFAULT_IMAGE;
}

function currencyCode(c) {
  const v = String(c || '').toUpperCase();
  if (!v || v === 'FCFA' || v === 'CFA') return 'XOF';
  return v.length === 3 ? v : 'XOF';
}

function countryCode(country) {
  const map = { "côte d'ivoire": 'CI', 'cote d\'ivoire': 'CI', sénégal: 'SN', senegal: 'SN', mali: 'ML', cameroun: 'CM', bénin: 'BJ', benin: 'BJ', togo: 'TG', 'burkina faso': 'BF', guinée: 'GN', guinee: 'GN', niger: 'NE', gabon: 'GA' };
  return map[String(country || '').toLowerCase()] || 'CI';
}

function formatDateFr(iso) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function formatAmount(n) {
  return new Intl.NumberFormat('fr-FR').format(n).replace(/\u202f|\u00a0/g, ' ');
}

function safeJson(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
