# Tests de charge (k6)

À exécuter **uniquement sur la préproduction** (copie de la plateforme, phases 0 à 4 déployées).
Jamais contre la production : `flash_sale.js` crée de vraies commandes et de vrais billets.

## Monter la préproduction (installation Babipass : Coolify + Supabase sur un même VPS)

⚠️ La production (API + Supabase) tourne sur **un seul serveur**. Une préproduction installée
sur cette même machine partagerait son processeur : un test de charge ralentirait les vrais
clients et fausserait les mesures. Utiliser **un second VPS** (même taille que la production,
loué à l'heure le temps des tests), ou à défaut tester la nuit, hors vente.

1. Sur le VPS de test, dans Coolify : un service **Supabase** et un **Server Backend** (même dépôt
   `emailpovider`, branche `main`), avec les mêmes variables que la production, sauf :
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` de la base de test, `ALLOW_TEST_PAYMENTS=true`,
   `ALERT_EMAILS` / `ALERT_WHATSAPP` vides, `CORS_ORIGINS` vide.
2. Restaurer la dernière sauvegarde de production dans la base de test
   (`pg_restore -U supabase_admin -d postgres --clean --if-exists sauvegarde.dump`), puis
   **vider les clés de paiement et SMTP** dans `platform_settings` de la base de test (aucun
   vrai e-mail ni paiement ne doit partir pendant les tests).
3. Mettre la base de test à jour : migrations `20261011` → `20261020`, puis `deploy/99_postcheck.sql`.

## Préparer

1. Installer k6 : <https://grafana.com/docs/k6/latest/set-up/install-k6/>
2. Sur le serveur de préproduction : `ALLOW_TEST_PAYMENTS=true` (faux opérateur « loadtest »,
   aucun argent réel). Le serveur affiche un avertissement 🚨 au démarrage : c'est normal ici,
   **inacceptable en production**.
3. Créer un événement de test publié, avec une catégorie de **1 000 places**, et un agent
   « SCANNER » rattaché à cet événement.
4. Si plusieurs instances API tournent, les tests passent par le proxy (et le CDN en dernier).

## Lancer, dans cet ordre

| # | Commande | Ce qui est mesuré | Réussi si |
|---|---|---|---|
| 1 | `k6 run -e API=… loadtests/browse.js` | Catalogue, accueil (chiffres, temps forts, moyens de paiement) et page événement, montée à 2 000 visiteurs | p95 < 300 ms, < 1 % d'erreurs |
| 2 | `k6 run -e API=… -e EVENT_ID=… -e TICKET_TYPE_ID=… -e BUYERS=5000 loadtests/flash_sale.js` | 5 000 acheteurs pour 1 000 places | 0 erreur 5xx, ~1 000 billets obtenus, le reste « complet » |
| 2b | `psql "$DATABASE_URL" -v event_id=<uuid> -f loadtests/verify_flash_sale.sql` | Intégrité en base | toutes les colonnes `ok_*` à `true` |
| 3 | `k6 run -e API=… -e AGENT_CODE=… -e AGENT_PIN=… loadtests/scanner.js` | 20 portes scannent les billets, chacun plusieurs fois | 1 seule entrée acceptée par billet, p95 < 500 ms |

Montée en charge progressive conseillée pour la vente flash : `BUYERS=1000`, puis `5000`, puis
`20000` (avec `MAX_VUS` adapté à la machine qui lance k6, ou k6 Cloud).

## Pendant les tests, surveiller

- `/metrics` (avec `METRICS_TOKEN`) : `checkout_queued_total`, latences `http_request_duration_ms`,
  `orders_pending`, `queue_email_pending`.
- Supabase : connexions actives, CPU, requêtes lentes (`pg_stat_statements`).
- Le worker : la file e-mail doit se vider (environ `SMTP_MAX_PER_SECOND` par seconde).

## Nettoyer

Les requêtes de nettoyage sont en commentaire à la fin de `verify_flash_sale.sql`.
Remettre ensuite `ALLOW_TEST_PAYMENTS` à vide sur la préproduction si elle sert à autre chose.
