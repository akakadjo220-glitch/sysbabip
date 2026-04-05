-- Ajout du champ 'status' à la table 'events'
ALTER TABLE events ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'published';

-- Mettre à jour les événements existants qui ont déjà eu lieu pour qu'ils soient 'completed'
-- Astuce : On considère qu'un événement est completed s'il est passé depuis plus de 24 heures.
UPDATE events 
SET status = 'completed' 
WHERE "date"::timestamp + interval '24 hours' < now();

-- Pour les utilisateurs (les organisateurs) le default devient published
UPDATE events 
SET status = 'published' 
WHERE status IS NULL;
