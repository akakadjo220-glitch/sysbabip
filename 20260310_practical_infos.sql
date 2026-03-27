-- Ajout du champ practical_infos (JSONB) à la table events pour stocker les infos modifiables dynamiquement.
ALTER TABLE events ADD COLUMN IF NOT EXISTS practical_infos JSONB DEFAULT '[
  {"icon": "MapPin", "title": "Accès", "description": "Parking surveillé disponible.\nAccessible via Boulevard Principal."},
  {"icon": "ShieldCheck", "title": "Sécurité", "description": "Contrôle des sacs à l''entrée.\nÉquipe médicale sur place."},
  {"icon": "Clock", "title": "Horaires", "description": "Ouverture des portes : 18h00\nDébut : 20h00"}
]'::jsonb;
