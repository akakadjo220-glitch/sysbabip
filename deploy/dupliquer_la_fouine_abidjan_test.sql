-- ═══════════════════════════════════════════════════════════════════════════
-- DUPLICATION : « 🎤 La Fouine fait vibrer Yamoussoukro ! » → événement de TEST à Abidjan
-- ═══════════════════════════════════════════════════════════════════════════
-- Copie l'événement (affiche, description, organisateur, réglages), puis change :
--   titre, adresse, date (30/11/2026, même heure que l'original : 16 h),
--   lieu « Sofitel Abidjan Hôtel Ivoire », géolocalisation (OpenStreetMap),
--   statut publié, compteurs remis à zéro, et 2 catégories :
--     Standard 100 FCFA × 100 billets, VIP 500 FCFA × 100 billets.
-- Sans risque : refuse de s'exécuter deux fois et ne modifie pas l'original.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_src  public.events%ROWTYPE;
  v_new  uuid := gen_random_uuid();
  v_slug text := 'la-fouine-fait-vibrer-abidjan-test';
BEGIN
  SELECT * INTO v_src FROM public.events WHERE slug = 'la-fouine-fait-vibrer-yamoussoukro';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Événement source introuvable (la-fouine-fait-vibrer-yamoussoukro)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Déjà dupliqué : https://babipass.com/event/%', v_slug;
  END IF;

  INSERT INTO public.events
  SELECT (jsonb_populate_record(NULL::public.events, to_jsonb(v_src) || jsonb_build_object(
    'id', v_new,
    'slug', v_slug,
    'title', '🎤 La Fouine fait vibrer Abidjan ! (test)',
    'date', '2026-11-30T16:00:00+00:00',
    'end_date', NULL,
    'location', 'Sofitel Abidjan Hôtel Ivoire',
    'city', 'Abidjan',
    'country', 'Côte d''Ivoire',
    'coordinates', jsonb_build_object('lat', 5.3264778, 'lng', -4.0043241),
    'status', 'published',
    'price', 100,
    'capacity', 200,
    'sold', 0,
    'views', 0,
    'average_rating', 0,
    'total_reviews', 0,
    'thanks_email_sent', false,
    'archived_at', NULL,
    'cancellation_status', 'none',
    'cancellation_reason', NULL,
    'home_score', NULL,
    'away_score', NULL,
    'match_status', NULL,
    'created_at', now()
  ))).*;

  INSERT INTO public.ticket_types (event_id, name, price, quantity, sold)
  VALUES (v_new, 'Standard', 100, 100, 0),
         (v_new, 'VIP', 500, 100, 0);

  RAISE NOTICE 'Événement créé : https://babipass.com/event/%', v_slug;
END $$;

COMMIT;

-- Vérification :
--   SELECT e.title, e.date, e.location, e.coordinates, e.status, t.name, t.price, t.quantity
--   FROM public.events e JOIN public.ticket_types t ON t.event_id = e.id
--   WHERE e.slug = 'la-fouine-fait-vibrer-abidjan-test';
--
-- Après les tests, pour le retirer de la vente (sans rien supprimer) :
--   UPDATE public.events SET status = 'cancelled' WHERE slug = 'la-fouine-fait-vibrer-abidjan-test';
