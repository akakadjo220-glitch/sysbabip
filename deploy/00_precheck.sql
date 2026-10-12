-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE AVANT MIGRATION — LECTURE SEULE (ne modifie rien)
-- ═══════════════════════════════════════════════════════════════════════════
-- À exécuter dans l'éditeur SQL Supabase AVANT les migrations 2026101x.
-- Chaque ligne doit afficher ok = true. Une ligne « BLOQUANT » à false doit être
-- corrigée avant de continuer ; une ligne « INFO » est à lire, pas bloquante.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN TRANSACTION READ ONLY;

WITH
required_tables(t) AS (VALUES
  ('profiles'), ('events'), ('ticket_types'), ('tickets'), ('transactions'),
  ('platform_settings'), ('auth_otps'), ('email_queue'), ('whatsapp_queue'),
  ('agents'), ('payout_requests'), ('fundraising_campaigns'), ('fundraising_contributions'),
  ('ambassador_links'), ('ticket_transfers'), ('ad_banners')
),
required_columns(t, c) AS (VALUES
  ('events', 'slug'), ('events', 'country'), ('events', 'category'), ('events', 'city'),
  ('events', 'date'), ('events', 'sold'), ('events', 'status'), ('events', 'organizer_id'),
  ('events', 'sales_close_before_minutes'), ('events', 'commission_rate'),
  ('events', 'ambassador_enabled'), ('events', 'ambassador_commission_type'), ('events', 'ambassador_commission_value'),
  ('events', 'views'), ('events', 'thanks_email_sent'), ('events', 'price'), ('events', 'currency'),
  ('ticket_types', 'quantity'), ('ticket_types', 'sold'), ('ticket_types', 'price'),
  ('tickets', 'created_at'), ('tickets', 'qr_code'), ('tickets', 'ticket_type'), ('tickets', 'transaction_id'),
  ('transactions', 'created_at'), ('transactions', 'ambassador_commission'), ('transactions', 'referral_code'),
  ('transactions', 'buyer_phone'), ('transactions', 'buyer_location'), ('transactions', 'commission_amount'),
  ('profiles', 'role'), ('profiles', 'status'), ('profiles', 'free_physical_tickets_granted'), ('profiles', 'free_physical_tickets_used'),
  ('agents', 'agent_code'), ('agents', 'pin_hash'), ('agents', 'auth_pin'), ('agents', 'is_active'), ('agents', 'event_id'), ('agents', 'organizer_id'),
  ('auth_otps', 'email'), ('auth_otps', 'otp_code'), ('auth_otps', 'expires_at'),
  ('ambassador_links', 'code'), ('ambassador_links', 'clicks'),
  ('payout_requests', 'type'), ('payout_requests', 'status'), ('payout_requests', 'reference')
),
required_functions(f) AS (VALUES
  ('pay_physical_commission'), ('increment_ambassador_stats'), ('increment_event_sold'),
  ('increment_ticket_type_sold'), ('find_tickets_by_contact')
),
checks AS (
  SELECT 'BLOQUANT' AS niveau, 'table public.' || t AS controle,
         to_regclass('public.' || t) IS NOT NULL AS ok, NULL::text AS detail
  FROM required_tables
  UNION ALL
  SELECT 'BLOQUANT', 'colonne ' || rc.t || '.' || rc.c,
         EXISTS (SELECT 1 FROM information_schema.columns ic
                 WHERE ic.table_schema = 'public' AND ic.table_name = rc.t AND ic.column_name = rc.c), NULL
  FROM required_columns rc
  UNION ALL
  SELECT 'BLOQUANT', 'fonction public.' || f || '()',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = f), NULL
  FROM required_functions
  UNION ALL
  SELECT 'BLOQUANT', 'extension pgcrypto disponible',
         EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgcrypto'), NULL
  UNION ALL
  SELECT 'BLOQUANT', 'statuts d''événement « published » et « completed »',
         (SELECT count(*) FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid
           WHERE ty.typname = 'event_status' AND e.enumlabel IN ('published', 'completed')) = 2
         OR NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status'), NULL
  UNION ALL
  SELECT 'BLOQUANT', 'schéma « archive » libre (pas d''objet homonyme non prévu)',
         NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'archive')
         OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'archive' AND c.relname = 'tickets'), NULL
  UNION ALL
  SELECT 'INFO', 'codes agents en double (le premier trouvé sera utilisé)',
         NOT EXISTS (SELECT 1 FROM public.agents GROUP BY upper(agent_code) HAVING count(*) > 1),
         (SELECT string_agg(code, ', ') FROM (SELECT upper(agent_code) AS code FROM public.agents
            GROUP BY 1 HAVING count(*) > 1 LIMIT 10) d)
  UNION ALL
  SELECT 'INFO', 'catégories déjà en survente (sold > quantity)',
         NOT EXISTS (SELECT 1 FROM public.ticket_types WHERE coalesce(sold, 0) > quantity),
         (SELECT count(*)::text || ' catégorie(s)' FROM public.ticket_types WHERE coalesce(sold, 0) > quantity)
  UNION ALL
  SELECT 'INFO', 'policies « ouvertes à tous » actuellement en place',
         false,
         (SELECT count(*)::text || ' policy(s) USING/WITH CHECK (true) — seront en partie supprimées'
            FROM pg_policies WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true'))
  UNION ALL
  SELECT 'INFO', 'volume actuel des billets',
         true, (SELECT reltuples::bigint::text || ' lignes (estimation)' FROM pg_class WHERE oid = 'public.tickets'::regclass)
)
SELECT niveau, controle, ok, detail
FROM checks
ORDER BY (niveau = 'BLOQUANT' AND NOT ok) DESC, niveau, controle;

ROLLBACK;
