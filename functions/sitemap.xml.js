// /sitemap.xml généré à partir de la base — voir worker/seo.js.
import { sitemapResponse } from '../worker/seo.js';

export const onRequestGet = (context) => sitemapResponse(context);
