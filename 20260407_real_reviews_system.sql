-- ============================================================
-- MIGRATION v2: Reviews System - Support Anonymous Reviews
-- Run this AFTER the first migration
-- ============================================================

-- 1. Create the reviews table (with nullable user_id for anonymous users)
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- NULLABLE for anon
    reviewer_name TEXT NOT NULL DEFAULT 'Anonyme',
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- If table already exists, patch it (add any missing columns):
ALTER TABLE public.reviews 
    ALTER COLUMN user_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS reviewer_name TEXT NOT NULL DEFAULT 'Anonyme',
    ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Remove duplicate constraint that blocks anonymous (multiple anon reviews)
-- Drop old unique constraint if it exists, we'll only block per logged-in user
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_event_id_user_id_key;

-- 2. Add aggregation columns to events table if they don't exist
ALTER TABLE public.events 
    ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

-- 3. Trigger Function
CREATE OR REPLACE FUNCTION public.update_event_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        UPDATE public.events
        SET 
            average_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE event_id = NEW.event_id AND is_approved = true), 0),
            total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE event_id = NEW.event_id AND is_approved = true)
        WHERE id = NEW.event_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.events
        SET 
            average_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE event_id = OLD.event_id AND is_approved = true), 0),
            total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE event_id = OLD.event_id AND is_approved = true)
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

-- 5. RLS Policies
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view approved reviews" ON public.reviews;
CREATE POLICY "Anyone can view approved reviews" ON public.reviews 
FOR SELECT USING (is_approved = true);

DROP POLICY IF EXISTS "Anyone can insert reviews" ON public.reviews;
CREATE POLICY "Anyone can insert reviews" ON public.reviews 
FOR INSERT WITH CHECK (true);

-- Admin/service can update (approve/reject)
DROP POLICY IF EXISTS "Service role can update reviews" ON public.reviews;
CREATE POLICY "Service role can update reviews" ON public.reviews 
FOR UPDATE USING (true);

-- 6. Grant permissions
GRANT ALL ON public.reviews TO anon, authenticated, service_role;
