-- 20261016_featured_event_public.sql
-- Rend lisible par les visiteurs le réglage « featured_event » (événement à la une
-- de l'accueil, un par pays : {"countries": {"Côte d'Ivoire": {"event_id": "...", "set_at": "..."}}}).
-- Il ne contient aucun secret.
--
-- Même fonction que dans 20261011_phase0_security_hardening.sql, avec une seule
-- différence : 'featured_event' ajouté à public_keys. Sans risque, rejouable.

CREATE OR REPLACE FUNCTION public.get_platform_settings(p_keys text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  r record;
  public_keys constant text[] := ARRAY[
    'payment_toggles', 'email_templates',
    'default_commission_rate', 'default_advance_rate',
    'default_fundraising_commission_rate', 'default_physical_commission_rate',
    'max_physical_tickets_per_batch',
    'featured_event'
  ];
BEGIN
  IF public.is_admin() THEN
    SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_result
    FROM public.platform_settings WHERE key = ANY(p_keys);
    RETURN v_result;
  END IF;

  FOR r IN SELECT key, value FROM public.platform_settings WHERE key = ANY(p_keys) LOOP
    IF r.key = ANY(public_keys) THEN
      v_result := v_result || jsonb_build_object(r.key, r.value);
    ELSIF r.key = 'paystack_config' THEN
      v_result := v_result || jsonb_build_object(r.key, jsonb_build_object('publicKey', r.value->'publicKey'));
    ELSIF r.key = 'chevereto_config' THEN
      v_result := v_result || jsonb_build_object(r.key, jsonb_build_object('enabled', coalesce(r.value->'enabled', 'false'::jsonb)));
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_platform_settings(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_settings(text[]) TO anon, authenticated, service_role;

-- Vérification : doit renvoyer {} tant qu'aucun événement n'est mis à la une,
-- puis {"featured_event": {...}} ensuite.
SELECT public.get_platform_settings(ARRAY['featured_event']);
