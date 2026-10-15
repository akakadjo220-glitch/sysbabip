-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS MIGRATION — LECTURE SEULE (ne modifie rien)
-- ═══════════════════════════════════════════════════════════════════════════
-- À exécuter après les 8 migrations. Toutes les lignes doivent afficher ok = true.
-- La première colonne indique la phase concernée en cas d'échec.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN TRANSACTION READ ONLY;

WITH
expected_functions(phase, f) AS (VALUES
  ('0', 'is_admin'), ('0', 'get_platform_settings'), ('0', 'protect_profile_privileged_columns'),
  ('1a', 'create_order'), ('1a', 'release_order'), ('1a', 'finalize_ticket_order'), ('1a', 'is_event_organizer'),
  ('1b', 'agent_authenticate'), ('1b', 'scanner_check_in'), ('1b', 'scanner_ticket_snapshot'), ('1b', 'transfer_ticket'),
  ('1c', 'finalize_order'), ('1c', 'create_donation_order'), ('1c', 'create_installment_order'),
  ('1c', 'physical_batch_quote'), ('1c', 'create_physical_batch'), ('1c', 'create_physical_commission_order'),
  ('2', 'queue_claim'), ('2', 'queue_complete'), ('2', 'queue_fail'), ('2', 'claim_job_lease'), ('2', 'rate_limit_hit'), ('2', 'purge_operational_data'),
  ('3', 'rollup_counters'), ('3', 'admin_transaction_kpis'), ('3', 'admin_global_totals'), ('3', 'organizer_overview'),
  ('5', 'archive_event'), ('5', 'archive_due_events'), ('5', 'restore_event'), ('5', 'ensure_archive_partitions'), ('5', 'table_sizes')
),
expected_tables(phase, t) AS (VALUES
  ('1a', 'public.orders'), ('2', 'public.job_leases'), ('2', 'public.rate_limits'),
  ('3', 'public.event_view_counters'), ('3', 'public.ambassador_click_counters'),
  ('5', 'archive.tickets'), ('5', 'archive.orders'), ('5', 'archive.ticket_type_counts')
),
-- Fonctions qui ne doivent JAMAIS être appelables par un visiteur anonyme.
server_only(f) AS (VALUES
  ('create_order'), ('finalize_order'), ('finalize_ticket_order'), ('release_order'), ('expire_stale_orders'),
  ('increment_event_sold'), ('increment_ticket_type_sold'), ('increment_ambassador_stats'),
  ('agent_authenticate'), ('agent_login'), ('scanner_check_in'), ('scanner_ticket_snapshot'), ('transfer_ticket'),
  ('find_tickets_by_contact'), ('save_whatsapp_otp'), ('verify_whatsapp_otp'), ('get_auth_users_info'),
  ('verify_organizer'), ('verify_agent_pin'), ('pay_physical_commission'), ('confirm_physical_commission_payment'),
  ('create_physical_batch'), ('create_donation_order'), ('create_installment_order'),
  ('queue_claim'), ('rate_limit_reset'), ('rollup_counters'), ('archive_due_events'), ('restore_event')
),
checks AS (
  -- Complément 20261018 : plus aucun accès anonyme ni policy ouverte sur ces tables
  SELECT 'compl' AS phase, 'anon sans droit sur ' || t AS controle,
         NOT (has_table_privilege('anon', 'public.' || t, 'SELECT')
              OR has_table_privilege('anon', 'public.' || t, 'INSERT')
              OR has_table_privilege('anon', 'public.' || t, 'UPDATE')
              OR has_table_privilege('anon', 'public.' || t, 'DELETE')) AS ok
  FROM unnest(ARRAY['transactions', 'agents', 'payout_settings']) AS t
  WHERE to_regclass('public.' || t) IS NOT NULL
  UNION ALL
  SELECT 'compl', 'aucune policy ouverte sur transactions / agents / payout_settings',
         NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename IN ('transactions', 'agents', 'payout_settings')
                     AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true'))
  UNION ALL
  SELECT 'compl', 'aucune écriture publique sur reviews / affiliate_links',
         NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename IN ('reviews', 'affiliate_links') AND cmd IN ('UPDATE', 'DELETE', 'ALL')
                     AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true'))
  UNION ALL
  SELECT phase, 'fonction ' || f || ' présente' AS controle,
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = f) AS ok
  FROM expected_functions
  UNION ALL
  SELECT phase, 'table ' || t || ' présente', to_regclass(t) IS NOT NULL FROM expected_tables
  UNION ALL
  SELECT '0', 'trigger anti auto-promotion sur profiles',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_profile_privileged_columns')
  UNION ALL
  SELECT '1a', 'garde-fou de stock sur ticket_types',
         EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ticket_types_stock')
  UNION ALL
  SELECT 'sécurité', 'anon ne peut pas exécuter ' || s.f,
         NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = s.f
                       AND has_function_privilege('anon', p.oid, 'EXECUTE'))
  FROM server_only s
  UNION ALL
  SELECT 'sécurité', 'anon ne lit pas tickets', NOT has_table_privilege('anon', 'public.tickets', 'SELECT')
  UNION ALL
  SELECT 'sécurité', 'anon ne modifie pas tickets', NOT has_table_privilege('anon', 'public.tickets', 'UPDATE')
  UNION ALL
  SELECT 'sécurité', 'anon n''accède pas à auth_otps', NOT has_table_privilege('anon', 'public.auth_otps', 'SELECT')
  UNION ALL
  SELECT 'sécurité', 'aucune policy « ouverte » sur ' || t,
         NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname = 'public' AND tablename = t
                       AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true'))
  FROM (VALUES ('platform_settings'), ('auth_otps'), ('tickets'), ('email_queue'), ('whatsapp_queue')) AS v(t)
  UNION ALL
  SELECT 'sécurité', 'aucune écriture « ouverte » sur ' || t,
         NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname = 'public' AND tablename = t
                       AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
                       AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true'))
  FROM (VALUES ('events'), ('profiles'), ('transactions'), ('ad_banners'), ('fundraising_contributions')) AS v(t)
  UNION ALL
  SELECT 'sécurité', 'toutes les fonctions SECURITY DEFINER ont un search_path fixé',
         NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.prosecdef
                       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'))
  UNION ALL
  SELECT 'sécurité', 'plus aucun code OTP ancien (en clair) en base',
         NOT EXISTS (SELECT 1 FROM public.auth_otps WHERE otp_code ~ '^\d{6}$')
)
SELECT phase, controle, ok
FROM checks
ORDER BY ok, phase, controle;

ROLLBACK;
