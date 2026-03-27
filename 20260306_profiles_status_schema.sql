-- Script d'ajout du système d'approbation des organisateurs
-- Ajoute la colonne 'status' à la table profiles

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Pour mettre par défaut les utilisateurs normaux en 'active' on laisse la valeur par défaut.
-- Dans le code React, lors de la création d'un compte Organisateur, on forcera status = 'pending'.
