/**
 * Babipass — Scanner des agents.
 *
 * L'agent se connecte auprès du serveur (code + PIN) et reçoit un jeton signé
 * de 12 h. Les scans, le cache hors-ligne et la synchronisation passent par le
 * serveur, qui limite l'agent à ses événements et valide chaque billet de façon
 * atomique.
 */
import { SERVER_URL } from '../config';

const TOKEN_KEY = 'afritix_agent_token';

export type ScanResult =
  | 'ok' | 'already_used' | 'revoked' | 'partial' | 'transferred' | 'invalid'
  | 'not_found' | 'wrong_event' | 'season_ok' | 'season_already' | 'error';

export interface ScannedTicket {
  id: string;
  guest_name?: string;
  ticket_type?: string;
  event_id?: string;
}

/** Session agent invalide ou expirée : il faut se reconnecter. */
export class AgentAuthError extends Error {}

/** Serveur injoignable : basculer en mode hors-ligne. */
export class ScannerNetworkError extends Error {}

async function request(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Agent ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    throw new ScannerNetworkError((err as Error).message);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AgentAuthError(data.error || 'Session agent expirée.');
  if (!res.ok || !data.success) throw new Error(data.error || 'Erreur serveur.');
  return data;
}

export const ScannerService = {
  async login(agentCode: string, pin: string) {
    const res = await fetch(`${SERVER_URL}/api/agent/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_code: agentCode, pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'Identifiant Agent ou Code PIN invalide.');
    localStorage.setItem(TOKEN_KEY, data.token);
    return data as { agent: any; token: string; expires_at: number };
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
  },

  hasSession() {
    return !!localStorage.getItem(TOKEN_KEY);
  },

  async scan(code: string): Promise<{ result: ScanResult; ticket?: ScannedTicket }> {
    return request('/api/scanner/scan', { method: 'POST', body: JSON.stringify({ code }) });
  },

  async snapshot(): Promise<{ id: string; status: string }[]> {
    const data = await request('/api/scanner/snapshot');
    return data.tickets || [];
  },

  async sync(codes: string[]): Promise<{ code: string; result: ScanResult }[]> {
    const data = await request('/api/scanner/sync', { method: 'POST', body: JSON.stringify({ codes }) });
    return data.results || [];
  },
};
