# Check-list de déploiement — Phases 0 à 5

> **À faire d'abord en préproduction**, puis en production avec exactement la même procédure.
> Cocher chaque case. Ne pas passer à l'étape suivante tant qu'une case reste en échec.

## Principe

Le nouveau code contient **les 6 phases en même temps** : le nouveau serveur a besoin des
nouvelles fonctions SQL, et l'ancien site ne fonctionne plus une fois les accès ouverts fermés.
Le déploiement se fait donc en **une fenêtre de maintenance** (site fermé 30 à 60 min) :

```
sauvegarde → précontrôle → 8 migrations → post-contrôle → serveur (API + worker) → site → tests → réouverture
```

Retour arrière possible **tant que le site n'est pas rouvert** (§ 8).

---

## 1. Préparation (J-7 à J-1)

### Code
- [ ] Commiter le **site** (dépôt `sysbabip`) : tout sauf `db_dump.json`, `didit_logs*.json`, `*.bak-phase0` (déjà ignorés).
- [ ] Commiter le **serveur** dans son propre dépôt (dossier `server/`, non versionné ici). Fichiers nouveaux :
      `services/checkout.js`, `scanner.js`, `jobs.js`, `rateLimitStore.js`, `catalog.js`, `admission.js`, `metrics.js`.
      Ne **pas** commiter `server/.env`, ni `index.js.bak-phase0`.
- [ ] Vérifier que `server/.env.example` du dépôt serveur ne contient **aucune vraie valeur**
      (l'ancienne version contenait la clé `service_role` : si elle a été poussée, voir § 1 Secrets).

### Secrets à changer (fuités ou exposés publiquement)
| Secret | Où le changer | Quand le saisir |
|---|---|---|
| Clés Paystack, PawaPay, PayDunya, FeexPay, InTouch | Tableau de bord de chaque opérateur | Jour J, étape « Saisir les nouvelles clés », via l'admin Babipass |
| Mot de passe SMTP | Hébergeur e-mail | Jour J, via l'admin |
| Clé API Chevereto, jeton WhatsApp | Chevereto / fournisseur WhatsApp | Jour J, via l'admin |
| Clé API Didit + secret de webhook | Console Didit | Variables du serveur (§ 2) |
| Mot de passe Postgres (était dans 10 scripts du dépôt) | Supabase (Cloud : Settings → Database ; auto-hébergé : procédure Supabase, `POSTGRES_PASSWORD`) | Avant le jour J, puis mettre à jour `DATABASE_URL` des scripts |
| Clé `service_role` / secret JWT | **Seulement si** `server/.env.example` avec la vraie clé a été poussé quelque part | Avant le jour J (régénère aussi la clé anon → rebuild du site) |

### Environnement
- [ ] Variables du serveur préparées (§ 2) — **identiques sur toutes les instances**.
- [ ] Une **préproduction** existe (copie de la base + serveur + site) et la procédure complète y a été jouée.
- [ ] Tests de charge passés en préproduction (`loadtests/README.md`).
- [ ] Créneau de maintenance choisi (trafic le plus faible), utilisateurs et organisateurs prévenus.
- [ ] Agents prévenus : ils devront **se reconnecter** après le déploiement.

---

## 2. Variables d'environnement

### Serveur — communes à l'API et au worker
| Variable | Valeur | Obligatoire |
|---|---|---|
| `SUPABASE_URL` | URL de l'API Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service_role | ✅ |
| `OTP_PEPPER`, `AGENT_TOKEN_SECRET`, `PAYMENT_CALLBACK_SECRET` | longues chaînes aléatoires, **identiques partout** (sinon dérivées de la clé service_role) | conseillé |
| `SMTP_STRICT_TLS` | `false` tant que le certificat SMTP n'est pas vérifié | — |
| `ALLOW_TEST_PAYMENTS` | **`false` en production** (vide = false) | ⚠️ |

### Serveur — service API (`PROCESS_ROLE=api`, 2 instances minimum)
| Variable | Valeur |
|---|---|
| `PROCESS_ROLE` | `api` |
| `PORT` | `3001` |
| `PUBLIC_API_URL` | ex. `https://api.babipass.com` (callbacks des opérateurs) |
| `CORS_ORIGINS` | `https://babipass.com,https://www.babipass.com` |
| `TRUST_PROXY_HOPS` | `1` (Traefik) ou `2` (Cloudflare + Traefik) |
| `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_CALLBACK_URL` | nouvelles valeurs Didit |
| `CHECKOUT_MAX_PER_SECOND_PER_EVENT` | `50` (à ajuster après tests de charge) |
| `CHECKOUT_MAX_CONCURRENT`, `CHECKOUT_MAX_PER_IP` | `20`, `300` |
| `METRICS_TOKEN` | chaîne aléatoire |
| `SUPABASE_READ_URL`, `SUPABASE_READ_KEY` | si réplica en lecture, sinon vide |
| `SENTRY_DSN` | facultatif (+ `npm i @sentry/node`) |

### Serveur — service worker (`PROCESS_ROLE=worker`, 1 instance)
| Variable | Valeur |
|---|---|
| `PROCESS_ROLE` | `worker` |
| `QUEUE_BATCH`, `EMAIL_CONCURRENCY`, `WHATSAPP_CONCURRENCY`, `SMTP_MAX_PER_SECOND` | `50`, `5`, `3`, `10` (selon le fournisseur SMTP) |
| `ARCHIVE_ENABLED` | **`false`** au lancement (activer plus tard, voir § 7) |
| `ARCHIVE_AFTER_DAYS` | `365` |

### Site (build Vite)
| Variable | Valeur |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | inchangées (sauf rotation JWT) |
| `VITE_SERVER_URL` | URL publique de l'API |

---

## 3. Base de données — ce qu'il faut exécuter

Tout s'exécute dans l'**éditeur SQL Supabase** (rôle `postgres`), **dans cet ordre exact**.
Chaque migration est une transaction : si elle échoue, rien n'est appliqué pour elle.

### 3.1 Sauvegarde (obligatoire)
```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > babipass_avant_deploiement_$(date +%Y%m%d_%H%M).dump
```
- [ ] Fichier créé, taille cohérente, `pg_restore --list fichier.dump | head` affiche des objets.
- [ ] Copie hors de la machine de la base.

### 3.2 Précontrôle — lecture seule
- [ ] Exécuter **`deploy/00_precheck.sql`**.
- [ ] Aucune ligne `BLOQUANT` à `false`. Lire les lignes `INFO` (codes agents en double, catégories déjà
      en survente : non bloquant, mais à signaler aux organisateurs concernés).

### 3.3 Les migrations, dans l'ordre
| # | Fichier | Ce qu'il fait | Durée | Contrôle |
|---|---|---|---|---|
| 1 | `20261011_phase0_security_hardening.sql` | Ferme `platform_settings`, `auth_otps`, files ; anti auto-promotion des profils ; retire l'exécution anonyme des fonctions sensibles ; fixe le `search_path` | secondes | lire les `NOTICE` : liste des policies supprimées |
| 2 | `20261012_phase1a_server_checkout.sql` | Table `orders`, réservation atomique, émission des billets côté serveur ; plus d'insertion anonyme de billets/transactions | secondes | `WARNING` éventuels « Policy ALL ouverte » : normaux, traités par la migration 3 |
| 3 | `20261013_phase1b_scanner_agents.sql` | Connexion agent (PIN haché, verrouillage), scan atomique, transfert sécurisé ; table `tickets` fermée aux anonymes | secondes à minutes (index sur `tickets`) | — |
| 4 | `20261014_phase1c_other_payments.sql` | Dons, paiement fractionné, billets physiques côté serveur ; `finalize_order` aiguille par type | secondes | — |
| 5 | `20261015_phase2_queues_jobs.sql` | Files durables, verrous de tâches, limites partagées, purge | secondes | — |
| 6 | `20261016_phase3_reads.sql` | Index, compteurs de vues répartis, statistiques en SQL | **minutes si grosses tables** | voir note ci-dessous |
| — | *(phase 4 : pas de migration)* | — | — | — |
| 7 | `20261017_phase5_archive.sql` | Schéma `archive`, archivage (inactif tant que `ARCHIVE_ENABLED=false`) | secondes | — |
| 8 | `20261018_close_remaining_open_policies.sql` | Ferme les dernières policies ouvertes relevées en base : `transactions`, `agents` (PIN), `payout_settings` illisibles par les anonymes ; avis et liens d'affiliation non modifiables par le public | secondes | `NOTICE` : liste des policies supprimées |

- [ ] Migration 1 OK  - [ ] 2 OK  - [ ] 3 OK  - [ ] 4 OK  - [ ] 5 OK  - [ ] 6 OK  - [ ] 7 OK  - [ ] 8 OK

**Note migration 6** : si `tickets` ou `transactions` dépassent quelques millions de lignes, créer
d'abord les index un par un avec `CREATE INDEX CONCURRENTLY …` (hors transaction, mêmes noms que
dans le fichier) : la migration les trouvera déjà créés (`IF NOT EXISTS`).

### 3.4 Post-contrôle — lecture seule
- [ ] Exécuter **`deploy/99_postcheck.sql`** : **toutes** les lignes à `ok = true`
      (fonctions et tables présentes, accès anonymes fermés, `search_path` fixés).

### 3.5 Réglages recommandés (phase 4, une fois)
```sql
ALTER ROLE anon          SET statement_timeout = '5s';
ALTER ROLE authenticated SET statement_timeout = '10s';
ALTER ROLE service_role  SET statement_timeout = '30s';
ALTER DATABASE postgres  SET idle_in_transaction_session_timeout = '60s';
```
- [ ] Appliqués (Supabase Cloud applique déjà des délais proches pour `anon`/`authenticated`).

### 3.6 À ne JAMAIS exécuter
Fichiers présents dans le dépôt, dangereux après ce déploiement :
- `supabase_schema.sql` — commence par `DROP TABLE … CASCADE` (efface tout).
- `20260406_reset_all_data.sql`, `20260306_reset_demo_data.sql` — vident les tables et les comptes.
- `admin_setup_fix.sql`, `DEFINITIVE_FIX_TICKETS_RECOVERY.sql`, `20260304_auth_otps_schema.sql`,
  `20260318_add_event_rates.sql`, `20260312_track_transactions_rpc.sql`, `20260317_fix_agent_login_rls.sql`,
  `20260403_ticket_transfers_schema.sql` — **rouvriraient les failles corrigées**.
- `20261012_phase1a_server_checkout.sql` **après** `20261014_phase1c` — écraserait l'aiguillage des paiements.
- Les scripts `*.cjs` de migration à la racine (`run_migration.cjs`, …) : anciens, à archiver.

Conseil : déplacer ces fichiers dans un dossier `sql/obsolete/` après le déploiement.

---

## 4. Jour J — déroulé

| Heure | Action | ✓ |
|---|---|---|
| T-30 min | Annonce « maintenance dans 30 min » ; vérifier qu'aucun événement n'a lieu pendant le créneau | [ ] |
| T-0 | **Fermer le site** : page de maintenance sur le domaine (Cloudflare ou nginx) et **arrêter l'API actuelle** (plus aucune vente) | [ ] |
| T+2 | Sauvegarde (§ 3.1) | [ ] |
| T+5 | Précontrôle (§ 3.2) | [ ] |
| T+8 | Migrations 1 → 7 (§ 3.3) | [ ] |
| T+15 | Post-contrôle (§ 3.4) | [ ] |
| T+17 | Déployer le **serveur** : service API (`PROCESS_ROLE=api`) puis service worker (`PROCESS_ROLE=worker`). Vérifier `GET /ready` → 200 et les journaux (aucune erreur au démarrage, pas d'alerte 🚨 `ALLOW_TEST_PAYMENTS`) | [ ] |
| T+22 | Déployer le **site** (build avec `VITE_SERVER_URL`) | [ ] |
| T+25 | **Saisir les nouvelles clés** (paiement, SMTP, Chevereto, WhatsApp) dans l'admin Babipass | [ ] |
| T+30 | Configurer les webhooks (§ 6) | [ ] |
| T+35 | **Tests de validation** (§ 5) — site encore fermé au public (accès par IP autorisée ou URL directe) | [ ] |
| T+55 | **Réouverture** si tout est vert ; sinon retour arrière (§ 8) | [ ] |

---

## 5. Tests de validation (avant réouverture)

### 5.1 Accès anonymes fermés (avec la clé anon publique)
```bash
ANON=<clé anon>; URL=<SUPABASE_URL>
curl -s "$URL/rest/v1/platform_settings?select=key" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"   # → []
curl -s "$URL/rest/v1/auth_otps?select=email"       -H "apikey: $ANON" -H "Authorization: Bearer $ANON"   # → erreur permission
curl -s "$URL/rest/v1/tickets?select=id&limit=1"    -H "apikey: $ANON" -H "Authorization: Bearer $ANON"   # → erreur permission
curl -s -X POST "$URL/rest/v1/rpc/increment_event_sold" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
     -H "Content-Type: application/json" -d '{"evt_id":"00000000-0000-0000-0000-000000000000","amount":-5}'      # → erreur permission
```
- [ ] Les 4 réponses sont conformes.

### 5.2 Parcours (petits montants réels, un par opérateur actif)
- [ ] Catalogue : la page d'accueil charge, filtres et pagination fonctionnent, carte affichée.
- [ ] Page événement : stock et prix affichés.
- [ ] **Achat** Paystack (carte) → billet reçu dans le site **et** par e-mail.
- [ ] **Achat** Mobile Money (chaque opérateur actif : PawaPay, FeexPay, InTouch, PayDunya) → billet reçu.
- [ ] Achat **3 places** → 3 billets distincts.
- [ ] Paiement en 3 fois : 1re tranche → billet « partiel » refusé au scan ; tranches suivantes → billet valide.
- [ ] Inscription **organisateur** (code reçu par e-mail / WhatsApp) et **mot de passe oublié**.
- [ ] Inscription **ambassadeur**.
- [ ] **Récupération de billets** (e-mail puis WhatsApp).
- [ ] **Transfert** d'un billet → le destinataire le reçoit, l'ancien est refusé au scan.
- [ ] **Agent** : connexion, scan d'un billet (accepté), second scan (refusé « déjà utilisé »),
      billet d'un autre événement (refusé), mode hors-ligne puis resynchronisation.
- [ ] **Billets physiques** : génération d'un petit lot (commission prélevée ou payée) → PDF/ZIP.
- [ ] **Don** à une collecte → contribution visible.
- [ ] **Didit** : lancement de la vérification depuis le tableau de bord organisateur.
- [ ] Admin : tableau de bord, KPIs, réglages lisibles et modifiables.
- [ ] Organisateur : vue d'ensemble (revenus, ventes 7 jours, répartition).
- [ ] Worker : journaux `[Worker] Démarrage…`, e-mails envoyés (file vide), aucun `[Job …] Erreur`.
- [ ] `GET /metrics` avec `METRICS_TOKEN` → réponse ; sans jeton → 404.

---

## 6. Configuration chez les tiers

- [ ] **Paystack** (Settings → API Keys & Webhooks) : webhook `https://<api>/api/webhooks/paystack`.
- [ ] **Didit** : webhook `https://<api>/api/webhooks/didit`, secret = `DIDIT_WEBHOOK_SECRET` ;
      envoyer un webhook de test depuis la console et vérifier qu'il est accepté (pas de 401).
- [ ] **FeexPay, InTouch, PayDunya** : rien à faire (l'URL de retour est envoyée à chaque commande via `PUBLIC_API_URL`).
- [ ] **PawaPay** : facultatif (le serveur interroge le statut lui-même).
- [ ] **Cloudflare** (si utilisé) : règles de cache et WAF de `docs/PHASE4_INFRA.md`.

---

## 7. Après l'ouverture

| Quand | Action |
|---|---|
| J+0 → J+2 | Surveiller : erreurs 5xx, `orders_pending`, file e-mail, journaux du worker, retours clients |
| J+1 | Vérifier qu'aucune commande ne reste `pending` plus de 2 h (sinon : opérateur, `PUBLIC_API_URL`, webhooks) |
| J+7 | Déplacer les fichiers SQL obsolètes (§ 3.6) ; mettre en place les alertes (`docs/PHASE4_INFRA.md` § 5) |
| J+30 | Premier **test de restauration** de sauvegarde (`docs/PHASE5_VOLUME.md` § 6) |
| Plus tard | Activer `ARCHIVE_ENABLED=true` sur le worker une fois tout stable |

---

## 8. Retour arrière

**Tant que le site n'est pas rouvert** (aucune vente sur la nouvelle version) :
1. Arrêter le nouveau serveur et le nouveau site.
2. Restaurer la sauvegarde :
   ```bash
   pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" babipass_avant_deploiement_XXXX.dump
   ```
3. Redéployer les **anciennes** versions du serveur et du site.
4. Rouvrir, analyser l'échec en préproduction, replanifier.

> ⚠️ Revenir à l'ancien code **rouvre toutes les failles** (clés de paiement lisibles, prise de
> contrôle de comptes, billets gratuits). Ce n'est qu'une solution d'attente de quelques heures.

**Après la réouverture** : ne plus restaurer la sauvegarde (on perdrait les ventes faites depuis).
Corriger « en avant » : correctif du serveur ou du site, ou migration SQL corrective.

En cas d'échec d'**une** migration pendant la fenêtre : elle est annulée automatiquement (transaction).
Lire l'erreur, corriger, la relancer ; les migrations précédentes restent appliquées. Ne jamais
relancer `20261012` après `20261014`.
