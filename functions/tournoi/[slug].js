// Aperçu de partage (WhatsApp, Facebook, Google) pour /tournoi/:slug — voir worker/seo.js.
import { sharePage } from '../../worker/seo.js';

export const onRequestGet = (context) => sharePage('tournoi', context);
