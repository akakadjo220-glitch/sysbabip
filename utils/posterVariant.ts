/**
 * Version réduite d'une affiche hébergée sur Chevereto.
 *
 * À chaque envoi, Chevereto crée lui-même une version « moyenne » (500 px de large,
 * proportions conservées) à côté de l'original : …/nom.jpeg → …/nom.md.jpeg.
 * Environ 2 à 3 fois plus légère, nette jusqu'à ~250 px affichés.
 *
 * Les autres hébergements (Supabase, etc.) sont renvoyés tels quels. Une petite image
 * peut ne pas avoir de version moyenne : prévoir un repli sur l'original (onError).
 */
const CHEVERETO_IMAGE = /^(https?:\/\/[^/]+\/images\/\d{4}\/\d{2}\/\d{2}\/[^/?#]+?)(\.(?:jpe?g|png|webp|gif))$/i;

export function mediumPoster(url: string): string {
  if (!url) return url;
  const m = url.match(CHEVERETO_IMAGE);
  if (!m || /\.(md|th)$/i.test(m[1])) return url;
  return `${m[1]}.md${m[2]}`;
}
