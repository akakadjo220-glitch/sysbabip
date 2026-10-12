-- Vérification après loadtests/flash_sale.js (environnement de test uniquement).
-- Remplacer :event_id par l'identifiant de l'événement testé (ou utiliser psql -v event_id=…).
-- Chaque ligne « ok » doit valoir true.

WITH tt AS (
  SELECT id, name, quantity, coalesce(sold, 0) AS sold
  FROM public.ticket_types WHERE event_id = :'event_id'
), issued AS (
  SELECT ticket_type, count(*) AS n
  FROM public.tickets WHERE event_id = :'event_id' AND id LIKE 'TIX-%'
  GROUP BY ticket_type
), pending AS (
  SELECT coalesce(sum(quantity), 0) AS n FROM public.orders
  WHERE event_id = :'event_id' AND status = 'pending'
)
SELECT
  tt.name,
  tt.quantity                                   AS places,
  tt.sold                                       AS vendues_ou_reservees,
  coalesce(issued.n, 0)                         AS billets_emis,
  tt.sold <= tt.quantity                        AS ok_pas_de_survente,
  coalesce(issued.n, 0) <= tt.quantity          AS ok_billets_dans_la_jauge
FROM tt LEFT JOIN issued ON issued.ticket_type = tt.id::text;

-- Aucun billet en double, aucune commande payée sans billets, une transaction par commande.
SELECT
  (SELECT count(*) = count(DISTINCT id) FROM public.tickets WHERE event_id = :'event_id')           AS ok_aucun_doublon,
  (SELECT count(*) = 0 FROM public.orders
     WHERE event_id = :'event_id' AND status = 'paid' AND coalesce(array_length(ticket_ids, 1), 0) = 0) AS ok_commandes_payees_avec_billets,
  (SELECT count(*) = count(DISTINCT order_id) FROM public.transactions
     WHERE event_id = :'event_id' AND order_id IS NOT NULL)                                             AS ok_une_transaction_par_commande,
  (SELECT count(*) FROM public.orders WHERE event_id = :'event_id' AND status = 'pending')             AS commandes_encore_en_attente;

-- Nettoyage de l'environnement de test (à exécuter seulement sur la préproduction) :
-- DELETE FROM public.tickets WHERE event_id = :'event_id' AND id LIKE 'TIX-%';
-- DELETE FROM public.transactions WHERE event_id = :'event_id' AND method = 'loadtest_momo';
-- DELETE FROM public.orders WHERE event_id = :'event_id' AND provider = 'loadtest';
-- UPDATE public.ticket_types SET sold = 0 WHERE event_id = :'event_id';
-- UPDATE public.events SET sold = 0 WHERE id = :'event_id';
