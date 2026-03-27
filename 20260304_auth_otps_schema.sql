-- 20260304_auth_otps.sql
-- Fichier de création de la table pour les OTPs de création de compte

-- 1. Table de stockage des OTPs temporaires
CREATE TABLE auth_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    otp_code VARCHAR(6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '15 minutes',
    user_metadata JSONB -- Optionnel, pour sauver Nom/Entreprise en attendant validation
);

-- 2. Index pour accélérer la recherche par email
CREATE INDEX idx_auth_otps_email ON auth_otps(email);

-- 3. Gestion de la sécurité RLS (Tout le monde peut insérer/lire avec l'API AnonKey)
ALTER TABLE auth_otps ENABLE ROW LEVEL SECURITY;

-- Autoriser l'insertion depuis le portail d'inscription
CREATE POLICY "Allow anonymous to insert OTPs"
ON auth_otps
FOR INSERT
TO public
WITH CHECK (true);

-- L'utilisateur doit pouvoir vérifier son propre OTP en le cherchant par email
CREATE POLICY "Allow user to check OTPs by email"
ON auth_otps
FOR SELECT
TO public
USING (true); -- La sécurité se fait dans le backend en vérifiant le code

-- L'utilisateur/le système peut effacer l'OTP une fois consommé
CREATE POLICY "Allow deletion"
ON auth_otps
FOR DELETE
TO public
USING (true);
