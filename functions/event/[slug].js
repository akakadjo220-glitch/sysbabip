// Aperçu de partage (WhatsApp, Facebook, Google) pour /event/:slug — voir worker/seo.js.
import { sharePage } from '../../worker/seo.js';

export const onRequestGet = (context) => sharePage('event', context);
