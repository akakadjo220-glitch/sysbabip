CREATE TABLE IF NOT EXISTS event_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    icon text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access for active categories"
    ON event_categories FOR SELECT
    USING (is_active = true);

CREATE POLICY "Allow admin full access to categories"
    ON event_categories FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
        )
    );

-- Insert default categories
INSERT INTO event_categories (name, icon, display_order) VALUES
('Concert', 'Music', 1),
('Festival', 'PartyPopper', 2),
('Soirée', 'GlassWater', 3),
('Conférence', 'Mic', 4),
('Sport', 'Trophy', 5),
('Atelier', 'GraduationCap', 6),
('Networking', 'Users', 7),
('Dîner de Gala', 'Utensils', 8),
('Théâtre & Humour', 'Theater', 9),
('Mode & Beauté', 'Sparkles', 10),
('Autre', 'MoreHorizontal', 99)
ON CONFLICT (name) DO NOTHING;
