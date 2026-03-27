-- Adds the buyer_location JSONB column to the transactions table to support the Organizer BI Heatmap
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS buyer_location JSONB;
