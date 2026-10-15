import { lazy, type ComponentType } from 'react';

// Chargement d'une page à la demande. Après une mise en ligne, les fichiers de
// l'ancienne version disparaissent : un visiteur resté sur l'ancienne page
// obtiendrait une erreur en changeant de page. On recharge alors une seule fois
// pour récupérer la nouvelle version.
const RELOAD_KEY = 'babipass_chunk_reload';

export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
    return lazy(async () => {
        try {
            const mod = await load();
            try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* stockage indisponible */ }
            return mod;
        } catch (err) {
            let alreadyReloaded = false;
            try { alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === '1'; } catch { /* idem */ }
            if (!alreadyReloaded) {
                try { sessionStorage.setItem(RELOAD_KEY, '1'); } catch { /* idem */ }
                window.location.reload();
                return new Promise<{ default: T }>(() => { /* la page se recharge */ });
            }
            throw err;
        }
    });
}

/** Pour les modules qui exportent un composant nommé : lazyNamed(() => import('./X'), 'X'). */
export function lazyNamed<M extends Record<string, any>, K extends keyof M>(load: () => Promise<M>, name: K) {
    return lazyPage(() => load().then(m => ({ default: m[name] as ComponentType<any> })));
}
