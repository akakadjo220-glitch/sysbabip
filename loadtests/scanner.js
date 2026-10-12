// k6 — Entrée d'un événement : plusieurs portes scannent en même temps
//
//   k6 run -e API=https://api-preprod.babipass.com \
//          -e AGENT_CODE=AG-001 -e AGENT_PIN=1234 loadtests/scanner.js
//
// L'agent doit être rattaché à l'événement testé (billets émis par flash_sale.js).
// Chaque billet est scanné deux fois par des « portes » différentes.
// Critères : exactement 1 « ok » par billet, l'autre scan « already_used »,
// p95 du scan < 500 ms, 0 erreur 5xx.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const API = __ENV.API || 'http://localhost:3001';
const GATES = Number(__ENV.GATES || 20);

const accepted = new Counter('entrees_acceptees');
const duplicates = new Counter('doubles_refuses');
const unexpected = new Counter('resultats_inattendus');

export const options = {
  scenarios: {
    portes: { executor: 'shared-iterations', vus: GATES, iterations: Number(__ENV.SCANS || 4000), maxDuration: '10m' },
  },
  thresholds: {
    'http_req_duration{etape:scan}': ['p(95)<500'],
    resultats_inattendus: ['count==0'],
  },
};

export function setup() {
  const login = http.post(`${API}/api/agent/login`,
    JSON.stringify({ agent_code: __ENV.AGENT_CODE, pin: __ENV.AGENT_PIN }),
    { headers: { 'Content-Type': 'application/json' } });
  if (login.status !== 200) throw new Error(`Connexion agent refusée (${login.status}).`);
  const token = login.json('token');

  const snap = http.get(`${API}/api/scanner/snapshot`, { headers: { Authorization: `Agent ${token}` } });
  const ids = (snap.json('tickets') || []).filter(t => t.status === 'valid').map(t => t.id);
  if (!ids.length) throw new Error('Aucun billet valide pour cet agent : lancer flash_sale.js avant.');
  return { token, ids };
}

export default function (data) {
  // Itérations 0..N-1 et N..2N-1 visent les mêmes billets : chaque billet passe deux fois.
  const ticket = data.ids[__ITER % data.ids.length];
  const res = http.post(`${API}/api/scanner/scan`, JSON.stringify({ code: ticket }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Agent ${data.token}` },
    tags: { etape: 'scan' },
  });
  check(res, { 'scan 200': r => r.status === 200 });
  const result = res.json('result');
  if (result === 'ok') accepted.add(1);
  else if (result === 'already_used') duplicates.add(1);
  else unexpected.add(1);
}
