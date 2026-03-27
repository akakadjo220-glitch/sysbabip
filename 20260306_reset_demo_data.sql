-- Script de Nettoyage de la Base de Données AfriTix
-- Attention: Exécuter ce script supprimera TOUTES les données (événements, billets, agents, bots). 
-- Les utilisateurs et organisateurs (table profiles) seront cependant CONSERVÉS.

-- 1. Désactiver temporairement les contraintes RLS pour effacer les données
SET session_replication_role = 'replica';

-- 2. Purge de toutes les données du système (hors profiles)
TRUNCATE TABLE 
  bot_rules,
  transactions,
  tickets,
  ticket_types,
  event_programs,
  agents,
  events
CASCADE;

-- 3. Réactiver les contraintes normales
SET session_replication_role = 'origin';

-- Le système est maintenant vierge et prêt pour la production.
