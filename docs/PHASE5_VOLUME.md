# Phase 5 — Volume : rester rapide avec des milliards de lignes

## Principe

La vitesse d'une base dépend surtout de la taille de ce qu'elle doit **parcourir et garder en
mémoire**, pas de l'historique total. On garde donc les tables actives petites :

| Donnée | Croissance | Traitement |
|---|---|---|
| Billets (`tickets`) | 1 ligne par place vendue — la plus grosse | **archivés** 1 an après l'événement |
| Commandes (`orders`) | 1 par tentative d'achat (payées ou non) | **archivées** avec l'événement |
| Files e-mail / WhatsApp, compteurs, OTP | très forte, éphémère | **purgés** chaque jour (phase 2) |
| Vues / clics | énorme | **agrégés** chaque minute (phase 3) |
| Transactions | 1 par achat payé | **conservées** (wallets, comptabilité) — voir § 5 |

Un événement archivé n'a plus besoin de ses billets : il est terminé depuis longtemps, plus
personne ne scanne ni ne récupère ces billets. Ses chiffres restent justes (transactions intactes,
répartition des billets figée dans `archive.ticket_type_counts`).

## 1. Activer l'archivage

1. Appliquer `20261017_phase5_archive.sql` (après les phases 0 à 3).
2. Sur le worker : `ARCHIVE_ENABLED=true`, `ARCHIVE_AFTER_DAYS=365` (minimum imposé : 30).
3. Le worker archive chaque nuit, par lots de 20 événements, 10 minutes maximum par passage.

Un événement est **ignoré** (et retenté la nuit suivante) s'il a :
- une commande en attente ou à rembourser,
- un paiement organisateur en cours (`payout_requests` en attente),
- une table liée qui référence encore ses billets (tout est annulé, rien n'est perdu).

Les événements ignorés et leur raison apparaissent dans les journaux du worker (`[Archive]`).

## 2. Restaurer un événement (litige, contrôle)

```sql
SELECT public.restore_event('<event_id>');   -- billets et commandes reviennent à l'identique
```
Avec `ARCHIVE_ENABLED=true`, il sera réarchivé la nuit suivante : pour un litige long, désactiver
temporairement l'archivage ou remettre l'événement en statut autre que `completed`.

## 3. Sortir les vieilles archives vers un stockage froid

`archive.tickets` et `archive.orders` sont partitionnées **par mois d'archivage**
(`archive.tickets_y2027m01`, …). Une partition ancienne se détache sans bloquer la base :

```sql
ALTER TABLE archive.tickets DETACH PARTITION archive.tickets_y2027m01;
```
```bash
pg_dump --table=archive.tickets_y2027m01 --format=custom "$DATABASE_URL" > tickets_2027_01.dump
```
Vérifier la sauvegarde (`pg_restore --list tickets_2027_01.dump`), la copier vers un stockage
objet (S3, R2, Backblaze…), puis :
```sql
DROP TABLE archive.tickets_y2027m01;
```

## 4. Suivre le volume

```sql
SELECT * FROM public.table_sizes();   -- 30 plus grosses tables, lignes estimées et taille
```
À surveiller mensuellement. Seuils indicatifs pour agir :
- `public.tickets` > 50 millions de lignes → réduire `ARCHIVE_AFTER_DAYS` (ex. 180).
- `public.transactions` > 100 millions → mettre en œuvre le § 5.

**Très gros événements** : un événement est archivé en une seule transaction. Au-delà d'environ
1 million de billets pour un seul événement, lancer son archivage manuellement en heure creuse
(`SELECT public.archive_event('<id>', 365);`).

## 5. Plus tard : partitionner les transactions

Les transactions alimentent les wallets organisateurs (`org_event_sales_view`) et les paiements :
on ne les archive pas sans refondre ces calculs. Quand elles dépasseront ~100 millions de lignes :

1. Créer `transactions_new` partitionnée par mois sur `created_at`, clé primaire `(id, created_at)`.
2. Copier par lots, puis basculer dans une fenêtre de maintenance courte (renommage des tables).
3. Remplacer la clé étrangère `tickets.transaction_id → transactions(id)` par une contrainte
   applicative (les partitions imposent la colonne de partition dans la clé).
4. Remplacer `org_event_sales_view` par une table de cumul par événement, mise à jour à chaque
   transaction, au lieu d'un `SUM` sur toute l'histoire.
5. Utiliser `pg_partman` pour créer les partitions à l'avance.

Ce chantier n'est utile qu'à très grande échelle ; il sera plus sûr avec des tests de charge
représentatifs en préproduction.

## 6. Sauvegardes et restauration (indispensable)

Le volume ne sert à rien sans la certitude de pouvoir restaurer.

- **Supabase Cloud** : activer le PITR (Point-in-Time Recovery) — restauration à la seconde près.
- **Auto-hébergé** : archivage continu des WAL (ex. `wal-g` ou `pgBackRest`) vers un stockage
  objet + sauvegarde complète quotidienne.

**Test de restauration — trimestriel, obligatoire** :
1. Restaurer la sauvegarde de la veille sur une machine séparée.
2. Vérifier : nombre de billets, transactions et commandes du dernier événement ; connexion d'un
   compte admin ; un scan de billet.
3. Noter la durée de restauration. Objectif : < 1 h pour une base complète.
4. Supprimer la machine de test.

Une sauvegarde jamais restaurée n'est pas une sauvegarde.
