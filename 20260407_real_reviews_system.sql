-- ============================================================
-- MIGRATION: Real Reviews System + Ratings Aggregation
-- Adds columns for average rating and review counts to events
-- And creates the infrastructure for real user reviews
-- ============================================================

-- 1. Create the reviews table
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id) -- One review per user per event
);

-- 2. Add aggregation columns to events table if they don't exist
ALTER TABLE public.events 
    ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

-- 3. Trigger Function to automatically update event stats
CREATE OR REPLACE FUNCTION public.update_event_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        UPDATE public.events
        SET 
            average_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE event_id = NEW.event_id),
            total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE event_id = NEW.event_id)
        WHERE id = NEW.event_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.events
        SET 
            average_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE event_id = OLD.event_id), 0),
            total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE event_id = OLD.event_id)
        WHERE id = OLD.event_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create the trigger
DROP TRIGGER IF EXISTS tr_update_event_rating ON public.reviews;
CREATE TRIGGER tr_update_event_rating
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.update_event_rating_stats();

-- 5. RLS Policies for reviews
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
CREATE POLICY "Anyone can view reviews" ON public.reviews FOR SELECT USING (true);

-- Authenticated users can insert their own reviews
DROP POLICY IF EXISTS "Auth users can insert reviews" ON public.reviews;
CREATE POLICY "Auth users can insert reviews" ON public.reviews 
FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- 6. Grant permissions
GRANT ALL ON public.reviews TO anon, authenticated, service_role;

-- 7. Seed initial simulated ratings (Fallback for existing events)
-- Note: This ensures all existing events follow the 4.5 - 5.0 rule requested
UPDATE public.events
SET 
  average_rating = 4.5 + (random() * 0.5),
  total_reviews = floor(random() * 50) + 20
WHERE total_reviews = 0;
