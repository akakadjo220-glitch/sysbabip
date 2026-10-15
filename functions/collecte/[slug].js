// Aperçu de partage (WhatsApp, Facebook, Google) pour /collecte/:slug — voir worker/seo.js.
import { sharePage } from '../../worker/seo.js';

export const onRequestGet = (context) => sharePage('collecte', context);
