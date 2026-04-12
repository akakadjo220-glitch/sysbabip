-- =========================================================================
-- SYSTEME DE FILE D'ATTENTE EMAIL (EMAIL QUEUE)
-- 2026-04-12
--
-- Objectif : Éviter l'envoi simultané massif de mails.
-- Le serveur Node.js insère dans cette table, puis un worker
-- les envoie un par un (max 5 à la fois, 300ms de délai entre chaque).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.email_queue (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    smtp_config    JSONB       NOT NULL,
    to_email       TEXT        NOT NULL,
    subject        TEXT        NOT NULL,
    html_body      TEXT        NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
    attempts       INT         NOT NULL DEFAULT 0,
    error_msg      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at   TIMESTAMPTZ
);

-- Index pour accélérer la dépilage par le worker
CREATE INDEX IF NOT EXISTS idx_email_queue_status_created
    ON public.email_queue (status, created_at);

-- Sécurité : Seul le service_role (serveur Node.js) peut manipuler cette table
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_queue' AND policyname = 'Server only access'
  ) THEN
    CREATE POLICY "Server only access"
      ON public.email_queue
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
