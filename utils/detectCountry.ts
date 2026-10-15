import { supabase } from '../supabaseClient';

// Pays affiché par défaut quand la détection échoue ou que le pays n'est pas couvert.
export const DEFAULT_COUNTRY = "Côte d'Ivoire";

// Codes ISO → noms utilisés par le catalogue (repli si la table supported_countries est indisponible).
const KNOWN: Record<string, string> = {
    ci: "Côte d'Ivoire", sn: 'Sénégal', cm: 'Cameroun', tg: 'Togo',
    cd: 'Congo RDC', fr: 'France', ml: 'Mali', ga: 'Gabon',
};

/**
 * Pays du visiteur (nom tel qu'utilisé par le catalogue), détecté par Cloudflare
 * via /geo. Ne bloque jamais plus de 1,5 s ; en cas de doute : Côte d'Ivoire.
 */
export async function detectCountry(): Promise<string> {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch('/geo', { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(timer));
        const { country } = await res.json();
        const code = String(country || '').toLowerCase();
        if (!code) return DEFAULT_COUNTRY;

        const { data } = await supabase.from('supported_countries').select('code, name').eq('is_active', true);
        const match = (data || []).find((c: any) => String(c.code || '').toLowerCase() === code);
        return match?.name || KNOWN[code] || DEFAULT_COUNTRY;
    } catch {
        return DEFAULT_COUNTRY;
    }
}
