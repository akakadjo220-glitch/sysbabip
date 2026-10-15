// Aperçu de partage (WhatsApp, Facebook, Google) pour /organisateur/:id — voir worker/seo.js.
import { sharePage } from '../../worker/seo.js';

export const onRequestGet = (context) => sharePage('organisateur', { ...context, params: { slug: context.params.id } });
