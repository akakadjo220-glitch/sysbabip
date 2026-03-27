-- Initialisation du bucket de stockage pour les événements
INSERT INTO storage.buckets (id, name, public) VALUES ('events', 'events', true) ON CONFLICT DO NOTHING;

-- Politiques de sécurité (lecture publique, écriture pour les organisateurs)
CREATE POLICY "Public Read Access" ON storage.objects FOR SELECT USING (bucket_id = 'events');
CREATE POLICY "Auth Insert Access" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'events' AND auth.role() = 'authenticated');
