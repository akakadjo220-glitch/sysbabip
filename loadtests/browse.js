// k6 — Navigation : catalogue + page événement (trafic de lecture d'un pic)
//
//   k6 run -e API=https://api-preprod.babipass.com -e SLUG=mon-concert loadtests/browse.js
//
// Critère de réussite (phase 3/4) : p95 < 300 ms, < 1 % d'erreurs à 2000 utilisateurs.
// Lancer d'abord sans CDN (mesure du serveur seul), puis à travers le CDN.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const API = __ENV.API || 'http://localhost:3001';
const SLUG = __ENV.SLUG || '';
const COUNTRIES = (__ENV.COUNTRIES || 'Global,CI,SN,BJ').split(',');
const PEAK = Number(__ENV.PEAK_VUS || 2000);

const errors = new Rate('errors');

export const options = {
  scenarios: {
    pic_de_visites: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.round(PEAK / 4) },
        { duration: '2m', target: PEAK },
        { duration: '3m', target: PEAK },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_duration{page:catalogue}': ['p(95)<300'],
    'http_req_duration{page:evenement}': ['p(95)<300'],
    errors: ['rate<0.01'],
  },
};

export default function () {
  const country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  const page = 1 + Math.floor(Math.random() * 3);

  const list = http.get(`${API}/api/public/events?country=${country}&page=${page}&limit=20`, { tags: { page: 'catalogue' } });
  const listOk = check(list, { 'catalogue 200': r => r.status === 200 });
  errors.add(!listOk);

  // Visiteur qui ouvre un événement : celui de la vente (SLUG) ou un du catalogue.
  let slug = SLUG;
  if (!slug && listOk) {
    const events = list.json('events') || [];
    if (events.length) slug = events[Math.floor(Math.random() * events.length)].slug;
  }
  if (slug) {
    const ev = http.get(`${API}/api/public/events/${slug}`, { tags: { page: 'evenement' } });
    errors.add(!check(ev, { 'événement 200': r => r.status === 200 }));
  }

  sleep(1 + Math.random() * 3); // temps de lecture
}
