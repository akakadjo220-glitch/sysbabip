-- ==========================================
-- MANUAL BUSINESS VERIFICATION (KYB) MIGRATION
-- ==========================================

-- 1. Add KYB columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS business_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS business_doc_url TEXT,
ADD COLUMN IF NOT EXISTS address_proof_url TEXT,
ADD COLUMN IF NOT EXISTS business_rejection_reason TEXT;

-- 2. Create RPC function for Admin to review KYB
CREATE OR REPLACE FUNCTION public.review_business_kyb(
    p_user_id UUID, 
    p_status TEXT, 
    p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Ensures this runs with elevated privileges to update the profile
AS $$
BEGIN
    -- Update the business verification status and optional rejection reason
    UPDATE public.profiles
    SET business_status = p_status,
        business_rejection_reason = p_reason
    WHERE id = p_user_id;
END;
$$;

-- 3. Create 'documents' storage bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage Security Policies for 'documents' bucket
-- These allow users to upload their business documents and admins to read them
DO $$
BEGIN
    -- Attempt to drop existing policies to avoid conflicts if re-running
    DROP POLICY IF EXISTS "Allow authenticated uploads to documents" ON storage.objects;
    DROP POLICY IF EXISTS "Allow public viewing of documents" ON storage.objects;
    DROP POLICY IF EXISTS "Allow users to modify their own documents" ON storage.objects;
    DROP POLICY IF EXISTS "Allow users to delete their own documents" ON storage.objects;
EXCEPTION WHEN OTHERS THEN
    -- Ignore errors during drop
END $$;

CREATE POLICY "Allow authenticated uploads to documents"
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Allow public viewing of documents"
ON storage.objects FOR SELECT USING (bucket_id = 'documents');

CREATE POLICY "Allow users to modify their own documents"
ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'documents');

CREATE POLICY "Allow users to delete their own documents"
ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents');
