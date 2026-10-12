// k6 — Vente flash : beaucoup plus d'acheteurs que de places, en même temps
//
// À lancer UNIQUEMENT sur un environnement de test dont le serveur a
// ALLOW_TEST_PAYMENTS=true (faux opérateur « loadtest », aucun argent réel).
//
//   k6 run -e API=https://api-preprod.babipass.com \
//          -e EVENT_ID=<uuid> -e TICKET_TYPE_ID=<uuid> \
//          -e BUYERS=5000 loadtests/flash_sale.js
//
// Puis vérifier en base avec loadtests/verify_flash_sale.sql.
// Critères de réussite : 0 survente, 0 billet en double, 0 erreur 5xx,
// chaque acheteur obtient soit un billet, soit « complet » (SOLD_OUT).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const API = __ENV.API || 'http://localhost:3001';
const EVENT_ID = __ENV.EVENT_ID;
const TICKET_TYPE_ID = __ENV.TICKET_TYPE_ID;
const BUYERS = Number(__ENV.BUYERS || 5000);
const MAX_WAIT_S = Number(__ENV.MAX_WAIT_S || 600);

const ticketsObtained = new Counter('billets_obtenus');
const soldOut = new Counter('reponses_complet');
const queuedResponses = new Counter('mises_en_file');
const serverErrors = new Counter('erreurs_5xx');
const timeToTicket = new Trend('delai_obtention_billet_ms', true);

export const options = {
  scenarios: {
    vente_flash: {
      executor: 'shared-iterations',
      vus: Math.min(BUYERS, Number(__ENV.MAX_VUS || 2000)),
      iterations: BUYERS,
      maxDuration: '20m',
    },
  },
  thresholds: {
    erreurs_5xx: ['count==0'],
    'http_req_duration{etape:commande}': ['p(95)<2000'],
  },
};

export function setup() {
  if (!EVENT_ID || !TICKET_TYPE_ID) throw new Error('EVENT_ID et TICKET_TYPE_ID sont obligatoires.');
  const ev = http.get(`${API}/api/public/events/${EVENT_ID}`);
  if (ev.status !== 200) throw new Error(`Événement introuvable ou non publié (${ev.status}).`);
}

export default function () {
  const start = Date.now();
  const body = JSON.stringify({
    event_id: EVENT_ID,
    items: { [TICKET_TYPE_ID]: 1 },
    provider: 'loadtest',
    buyer: { name: `Charge ${__VU}-${__ITER}`, email: `charge+${__VU}-${__ITER}@example.com`, contact_method: 'email' },
  });
  const params = { headers: { 'Content-Type': 'application/json' }, tags: { etape: 'commande' } };

  // Création de commande, en respectant la salle d'attente (429 + Retry-After).
  let res;
  while (true) {
    res = http.post(`${API}/api/checkout/orders`, body, params);
    if (res.status === 429 && (Date.now() - start) / 1000 < MAX_WAIT_S) {
      queuedResponses.add(1);
      sleep(Number(res.headers['Retry-After'] || 2));
      continue;
    }
    break;
  }

  if (res.status >= 500) { serverErrors.add(1); return; }
  if (res.status === 409) { soldOut.add(1); return; }
  if (!check(res, { 'commande créée': r => r.status === 201 })) return;

  const order = res.json('order');
  // Suivi du paiement (immédiatement « payé » avec le faux opérateur).
  for (let i = 0; i < 30; i++) {
    const st = http.get(`${API}/api/checkout/orders/${order.id}?token=${order.token}`, { tags: { etape: 'suivi' } });
    if (st.status >= 500) { serverErrors.add(1); return; }
    const status = st.json('status');
    if (status === 'paid') {
      ticketsObtained.add((st.json('tickets') || []).length);
      timeToTicket.add(Date.now() - start);
      return;
    }
    if (status !== 'pending') return;
    sleep(1);
  }
}

export function teardown() {
  console.log('Vérifiez maintenant en base : psql … -v event_id=… -f loadtests/verify_flash_sale.sql');
}
