# Phase 4 — Tenir les pics de charge : guide d'infrastructure

Ce que le code fait déjà (phases 1 à 4) et ce qu'il reste à configurer autour.

## 1. Ce qui est déjà dans le code

| Mécanisme | Où | Réglage |
|---|---|---|
| Salle d'attente au checkout (429 + réessai automatique côté site) | `server/services/admission.js` | `CHECKOUT_MAX_PER_SECOND_PER_EVENT` (50), `CHECKOUT_MAX_CONCURRENT` (20 par instance) |
| Réservation atomique (aucune survente) | `create_order` (SQL phase 1a) | — |
| Catalogue mis en cache + en-têtes CDN | `server/services/catalog.js` | `s-maxage` 60 s (liste), 10 s (événement) |
| Réplica en lecture pour le catalogue | `server/index.js` | `SUPABASE_READ_URL`, `SUPABASE_READ_KEY` |
| Métriques Prometheus, sonde `/ready` | `server/services/metrics.js` | `METRICS_TOKEN` |
| Sentry (facultatif) | `server/services/metrics.js` | `SENTRY_DSN` + `npm i @sentry/node` |
| API et worker séparables | `PROCESS_ROLE=api` / `worker` | — |

**Dimensionner la salle d'attente** : `CHECKOUT_MAX_PER_SECOND_PER_EVENT` = ce que la base encaisse
sans dégrader (mesuré avec `flash_sale.js`, en partant de 50). Au-delà, les acheteurs patientent
quelques secondes au lieu de faire tomber le site.

## 2. CDN et pare-feu (Cloudflare, plan gratuit suffisant pour démarrer)

1. Mettre `babipass.com` et `api.babipass.com` derrière Cloudflare (proxy orange).
2. **Règles de cache** (Caching → Cache Rules) :
   - `api.babipass.com/api/public/*` : « Eligible for cache », respecter les en-têtes d'origine.
   - Tout le reste de `api.babipass.com` : **Bypass cache** (paiements, scans, comptes).
   - `babipass.com/assets/*` : cache long (déjà `expires 1y` dans nginx).
3. **Pare-feu (WAF)** : activer les règles gérées, bloquer les pays/ASN sans clientèle si besoin,
   règle de limitation sur `/api/auth/*` (ex. 20 requêtes / 10 s / IP) en complément du serveur.
4. **Waiting Room Cloudflare** (plans Business/Enterprise, optionnelle) sur
   `babipass.com/event/<slug>` pour les très grosses ventes. Sans elle, la salle d'attente du
   serveur protège déjà la base.
5. Côté serveur : `TRUST_PROXY_HOPS` = nombre de proxys (Cloudflare + Traefik = 2), sinon toutes
   les requêtes semblent venir de la même IP. Restreindre l'accès direct à l'origine aux IP Cloudflare.

## 3. Base de données

### Connexions
- Le serveur passe par PostgREST (Supabase) : son pool est réglé par `PGRST_DB_POOL`
  (auto-hébergé) ou par le plan (Supabase Cloud). Viser : `instances API × 10` < `max_connections − 20`.
- Pour les scripts/migrations en connexion directe : passer par **Supavisor** (port 6543, mode
  transaction) plutôt que 5432.
- Délais maximum par rôle (évite qu'une requête lente bloque tout) :
  ```sql
  ALTER ROLE anon          SET statement_timeout = '5s';
  ALTER ROLE authenticated SET statement_timeout = '10s';
  ALTER ROLE service_role  SET statement_timeout = '30s';
  ALTER DATABASE postgres  SET idle_in_transaction_session_timeout = '60s';
  ```

### Réplica en lecture
- **Supabase Cloud** (plan Pro et +) : Settings → Infrastructure → Read replicas. Renseigner
  l'URL d'API du réplica dans `SUPABASE_READ_URL`.
- **Auto-hébergé** (cas actuel, `sslip.io`) : réplication physique Postgres (streaming) vers une
  seconde machine + une instance PostgREST/Kong pointant dessus ; son URL va dans `SUPABASE_READ_URL`.
- Seul le catalogue public lit sur le réplica. Achats, scans, paiements et tableaux de bord
  restent sur la base principale (pas de lecture « en retard » pour l'argent).

### Point unique de défaillance
Une seule VM auto-hébergée = toute la plateforme s'arrête si elle tombe. Minimum avant une grosse
vente : sauvegardes automatiques + **PITR testé** (restaurer réellement une sauvegarde), ou
migration vers Supabase Cloud (Team) avec haute disponibilité.

## 4. Mise à l'échelle des serveurs (Coolify)

| Service | Variables | Instances |
|---|---|---|
| API | `PROCESS_ROLE=api` | 2 minimum (tolérance), +1 par ~500 req/s mesurées |
| Worker | `PROCESS_ROLE=worker` | 1 (2 pour la tolérance ; jamais de doublon d'envoi) |

- Sonde de santé du proxy : `/ready` (vérifie la base), pas `/health`.
- Arrêt propre : laisser 30 s au conteneur après SIGTERM (déploiements sans coupure).

## 5. Monitoring et alertes

Collecte : un Prometheus/Grafana, Better Stack ou Grafana Cloud qui lit `/metrics`
(`Authorization: Bearer $METRICS_TOKEN`) sur chaque instance API.

| Alerte | Seuil indicatif | Signification |
|---|---|---|
| `http_requests_total{status="5xx"}` | > 1 % sur 5 min | erreurs serveur |
| p95 `http_request_duration_ms` (checkout) | > 2 s sur 5 min | base saturée |
| `checkout_queued_total` | en forte hausse | salle d'attente active : normal en vente flash, à surveiller |
| `orders_pending` | > 1 000 durable | paiements non confirmés (opérateur en panne ? webhook ?) |
| `queue_oldest_pending_seconds` | > 600 | e-mails en retard (SMTP ?) |
| `queue_email_failed` | en hausse | e-mails abandonnés |
| `/ready` | ≠ 200 | base injoignable |

Erreurs applicatives : Sentry côté serveur (`SENTRY_DSN`) et côté site (`@sentry/react`, à ajouter).

## 6. Procédure avant une grosse vente

1. Tests `loadtests/` sur la préproduction au volume attendu ×2.
2. Régler `CHECKOUT_MAX_PER_SECOND_PER_EVENT` d'après la vente flash test.
3. Vérifier : sauvegarde récente, alertes actives, 2 instances API + 1 worker, CDN actif.
4. Pendant la vente : tableau de bord ouvert (latences, file d'attente, commandes en attente, 5xx).
