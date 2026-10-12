/**
 * AfriTix — Utilitaire pour charger les configurations de la plateforme
 * depuis Supabase (table platform_settings) au lieu de localStorage.
 *
 * La table n'est plus lisible directement : on passe par la RPC
 * get_platform_settings, qui renvoie toutes les valeurs à un admin et
 * uniquement les réglages publics (sans secrets) aux autres visiteurs.
 *
 * Inclut un cache mémoire de 5 minutes pour éviter les requêtes multiples.
 */
import { supabase } from '../supabaseClient';

// Cache mémoire simple (évite de requêter Supabase à chaque appel)
const settingsCache: Record<string, { value: any; expiry: number }> = {};
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Charge une configuration par sa clé.
 * Utilise un cache mémoire de 5 minutes.
 */
export async function getPlatformSetting<T = any>(key: string): Promise<T | null> {
    const settings = await getPlatformSettings([key]);
    return (settings[key] ?? null) as T | null;
}

/**
 * Charge plusieurs configurations en une seule requête.
 */
export async function getPlatformSettings(keys: string[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    const keysToFetch: string[] = [];

    // Vérifier le cache d'abord
    for (const key of keys) {
        const cached = settingsCache[key];
        if (cached && Date.now() < cached.expiry) {
            result[key] = cached.value;
        } else {
            keysToFetch.push(key);
        }
    }

    if (keysToFetch.length > 0) {
        let fetched: Record<string, any> = {};
        const { data, error } = await supabase.rpc('get_platform_settings', { p_keys: keysToFetch });

        if (!error && data) {
            fetched = data as Record<string, any>;
        } else if (error?.code === 'PGRST202') {
            // RPC pas encore créée (migration phase 0 non appliquée) : ancien accès direct.
            const { data: rows } = await supabase
                .from('platform_settings')
                .select('key, value')
                .in('key', keysToFetch);
            for (const row of rows || []) fetched[row.key] = row.value;
        }

        for (const [key, value] of Object.entries(fetched)) {
            result[key] = value;
            settingsCache[key] = { value, expiry: Date.now() + CACHE_DURATION_MS };
        }
    }

    return result;
}

/**
 * Vide le cache (à appeler après une sauvegarde admin ou un changement de session).
 */
export function clearSettingsCache() {
    Object.keys(settingsCache).forEach(key => delete settingsCache[key]);
}
