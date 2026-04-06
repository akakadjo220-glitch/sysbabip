-- SCRIPT DE NETTOYAGE COMPLET ET DÉFINITIF DE LA BASE DE DONNÉES
-- Attention : Ce script efface toutes les données d'exploitation (Evénements, Utilisateurs, Transactions, Billets).
-- NE CONSERVE QUE LES COMPTES ADMIN ET LES RÉGLAGES (platform_settings).

-- 1. Désactiver temporairement les contraintes strictes pour forcer le nettoyage complet
SET session_replication_role = 'replica';

-- 2. Vider toutes les tables opérationnelles de manière brutale 
TRUNCATE TABLE 
  bot_rules,
  transactions,
  tickets,
  ticket_types,
  event_programs,
  agents,
  payout_requests,
  ambassador_withdrawals,
  push_campaigns,
  auth_otps,
  events
CASCADE;

-- 3. Réactiver les contraintes normales de la base
SET session_replication_role = 'origin';

-- 4. Vider la base d'authentification Supabase (Cela déconnectera et supprimera tout le monde de l'application)
-- EXCEPTION CRITIQUE : Ne supprime PAS les utilisateurs qui ont le rôle 'ADMIN' dans la table profiles.
DELETE FROM auth.users 
WHERE id NOT IN (
  SELECT id FROM public.profiles WHERE role = 'ADMIN'
);

-- Note : Grace aux règles CASCADE de Supabase, la suppression dans auth.users 
-- va automatiquement supprimer les lignes correspondantes dans public.profiles.

-- FIN DU SCRIPT. LE SYSTÈME EST MAINTENANT VIERGE.
