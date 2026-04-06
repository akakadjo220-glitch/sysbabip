-- ============================================================
-- Migration: 20260405_address_verification_schema.sql
-- Description:
-- Adds address verification for organizers to unlock Physical Tickets.
-- Requires an electricity/water bill, residence certificate, or RIB.
-- ============================================================

-- 1. Add columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_doc_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_status TEXT DEFAULT 'none'; -- 'none', 'pending', 'verified', 'rejected'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_rejection_reason TEXT;

-- 2. Create the KYCDocuments Storage Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc_documents', 'kyc_documents', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage Policies for kyc_documents
-- Allow authenticated users to upload to their own folder (folder name = user_id)
CREATE POLICY "Users can upload their own KYC documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'kyc_documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to view their own documents
CREATE POLICY "Users can view their own KYC documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'kyc_documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow admins to view all documents
CREATE POLICY "Admins can view all KYC documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'kyc_documents' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);

-- Allow admins to delete/update files if needed
CREATE POLICY "Admins can manage all KYC documents"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'kyc_documents' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);
