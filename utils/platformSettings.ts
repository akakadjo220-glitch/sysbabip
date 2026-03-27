/**
 * AfriTix — Utilitaire pour charger les configurations de la plateforme
 * depuis Supabase (table platform_settings) au lieu de localStorage.
 * 
 * Inclut un cache mémoire de 5 minutes pour éviter les requêtes multiples.
 */
import { supabase } from '../supabaseClient';

// Cache mémoire simple (évite de requêter Supabase à chaque appel)
const settingsCache: Record<string, { value: any; expiry: number }> = {};
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Charge une configuration par sa clé depuis la table platform_settings.
 * Utilise un cache mémoire de 5 minutes.
 */
export async function getPlatformSetting<T = any>(key: string): Promise<T | null> {
    // Vérifier le cache
    const cached = settingsCache[key];
    if (cached && Date.now() < cached.expiry) {
        return cached.value as T;
    }

    // Charger depuis Supabase
    const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

    if (error || !data) return null;

    // Mettre en cache
    settingsCache[key] = { value: data.value, expiry: Date.now() + CACHE_DURATION_MS };
    return data.value as T;
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
        const { data } = await supabase
            .from('platform_settings')
            .select('key, value')
            .in('key', keysToFetch);

        if (data) {
            for (const row of data) {
                result[row.key] = row.value;
                settingsCache[row.key] = { value: row.value, expiry: Date.now() + CACHE_DURATION_MS };
            }
        }
    }

    return result;
}

/**
 * Vide le cache (à appeler après une sauvegarde admin).
 */
export function clearSettingsCache() {
    Object.keys(settingsCache).forEach(key => delete settingsCache[key]);
}
