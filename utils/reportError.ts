import { SERVER_URL } from '../config';

// Signale au serveur les erreurs JavaScript des visiteurs (visibles ensuite dans
// les logs Coolify). Au plus 5 par page, sans doublon, sans paramètres d'URL.
const MAX_REPORTS = 5;
let sent = 0;
const seen = new Set<string>();

export function reportError(error: unknown, context = '') {
    try {
        const err = error instanceof Error ? error : new Error(String(error));
        const message = `${context ? `${context} : ` : ''}${err.message || 'Erreur inconnue'}`.slice(0, 300);
        if (sent >= MAX_REPORTS || seen.has(message)) return;
        seen.add(message);
        sent++;
        const body = JSON.stringify({ message, stack: (err.stack || '').slice(0, 1500), page: window.location.pathname });
        const url = `${SERVER_URL}/api/client-errors`;
        // sendBeacon survit à la fermeture de la page ; sinon fetch « keepalive ».
        if (!(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'application/json' })))) {
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
        }
    } catch {
        /* le signalement ne doit jamais provoquer d'autre erreur */
    }
}

/** Écoute les erreurs non rattrapées de toute l'application. */
export function installGlobalErrorReporting() {
    window.addEventListener('error', (event) => {
        // Les erreurs de chargement de ressources (images…) n'ont pas d'objet error : ignorées.
        if (event.error) reportError(event.error);
    });
    window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'Promesse rejetée'));
}
