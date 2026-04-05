-- Add buyer_phone to transactions to track guest phone numbers for mobile money payments
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
