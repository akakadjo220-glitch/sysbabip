import { PAYMENT_ROUTING } from '../constants';
import { SERVER_URL } from '../config';

// Moyens de paiement présentés à l'acheteur sous leur nom courant (Wave, Orange
// Money…), dans l'ordre d'usage du pays. Chaque option liste les passerelles
// capables de la traiter, par priorité ; la première activée par l'admin est utilisée.
export type GatewayId = 'pawapay' | 'feexpay' | 'intouch' | 'paydunya' | 'paystack';

export interface PaymentOption {
    key: string;
    label: string;
    hint: string;
    color: string;           // couleur de la pastille
    kind: 'momo' | 'card';
    gateway: GatewayId;
    network?: string;        // code réseau attendu par la passerelle
}

type Candidate = { gateway: GatewayId; network?: string };
type OptionDef = Omit<PaymentOption, 'gateway' | 'network'> & { via: Candidate[] };

const CARD: OptionDef = {
    key: 'card', label: 'Carte bancaire', hint: 'Visa, Mastercard', color: 'bg-indigo-500', kind: 'card',
    via: [{ gateway: 'paystack' }],
};

const BY_COUNTRY: Record<string, OptionDef[]> = {
    CI: [
        { key: 'wave', label: 'Wave', hint: 'Validation dans l\'application Wave', color: 'bg-sky-500', kind: 'momo', via: [{ gateway: 'pawapay', network: 'WAVE_CI' }] },
        { key: 'orange', label: 'Orange Money', hint: 'Validation par code secret', color: 'bg-orange-500', kind: 'momo', via: [{ gateway: 'pawapay', network: 'ORANGE_CI' }] },
        { key: 'mtn', label: 'MTN MoMo', hint: 'Validation par code secret', color: 'bg-yellow-400', kind: 'momo', via: [{ gateway: 'pawapay', network: 'MTN_CI' }] },
        { key: 'moov', label: 'Moov Money', hint: 'Validation par code secret', color: 'bg-blue-600', kind: 'momo', via: [{ gateway: 'pawapay', network: 'MOOV_CI' }] },
        CARD,
    ],
    SN: [
        { key: 'wave', label: 'Wave', hint: 'Validation dans l\'application Wave', color: 'bg-sky-500', kind: 'momo', via: [{ gateway: 'intouch', network: 'WAVE_SN' }, { gateway: 'paydunya', network: 'wave-senegal' }] },
        { key: 'orange', label: 'Orange Money', hint: 'Validation par code secret', color: 'bg-orange-500', kind: 'momo', via: [{ gateway: 'intouch', network: 'ORANGE_SN' }, { gateway: 'paydunya', network: 'orange-money-senegal' }] },
        { key: 'free', label: 'Free Money', hint: 'Validation par code secret', color: 'bg-red-500', kind: 'momo', via: [{ gateway: 'paydunya', network: 'free-money-senegal' }] },
        CARD,
    ],
    BJ: [
        { key: 'mtn', label: 'MTN MoMo', hint: 'Validation par code secret', color: 'bg-yellow-400', kind: 'momo', via: [{ gateway: 'feexpay', network: 'MTN_BJ' }] },
        { key: 'moov', label: 'Moov Money', hint: 'Validation par code secret', color: 'bg-blue-600', kind: 'momo', via: [{ gateway: 'feexpay', network: 'MOOV_BJ' }] },
        { key: 'celtiis', label: 'Celtiis', hint: 'Validation par code secret', color: 'bg-emerald-500', kind: 'momo', via: [{ gateway: 'feexpay', network: 'CELTIIS_BJ' }] },
        CARD,
    ],
    TG: [
        { key: 'togocel', label: 'T-Money (Togocel)', hint: 'Validation par code secret', color: 'bg-yellow-400', kind: 'momo', via: [{ gateway: 'feexpay', network: 'TOGOCEL' }] },
        CARD,
    ],
    CM: [
        { key: 'orange', label: 'Orange Money', hint: 'Validation par code secret', color: 'bg-orange-500', kind: 'momo', via: [{ gateway: 'intouch', network: 'ORANGE_CM' }] },
        CARD,
    ],
    ML: [
        { key: 'orange', label: 'Orange Money', hint: 'Validation par code secret', color: 'bg-orange-500', kind: 'momo', via: [{ gateway: 'intouch', network: 'ORANGE_ML' }] },
        CARD,
    ],
};

/**
 * Options disponibles pour un pays, compte tenu des passerelles utilisables
 * (activées ET configurées, voir loadAvailablePayments). Si Paystack encaisse
 * aussi le Mobile Money, le bouton carte l'indique.
 */
export function paymentOptionsFor(
    countryCode: string,
    active: Partial<Record<GatewayId, boolean>>,
    paystackMobileMoney = false
): PaymentOption[] {
    const defs = BY_COUNTRY[countryCode] || (PAYMENT_ROUTING[countryCode] ? [CARD] : []);
    const out: PaymentOption[] = [];
    for (const { via, ...rest } of defs) {
        const pick = via.find(c => active[c.gateway]);
        if (!pick) continue;
        const option: PaymentOption = { ...rest, gateway: pick.gateway, network: pick.network };
        if (option.kind === 'card' && paystackMobileMoney) {
            option.label = 'Carte ou Mobile Money';
            option.hint = 'Visa, Mastercard, Wave, Orange Money… dans la fenêtre sécurisée';
        }
        out.push(option);
    }
    return out;
}

export interface AvailablePayments {
    providers: Partial<Record<GatewayId, boolean>>;
    paystackMobileMoney: boolean;
}

let availableCache: { at: number; value: Promise<AvailablePayments> } | null = null;

/**
 * Passerelles réellement utilisables, selon le serveur (activées dans l'admin ET
 * clés saisies). Mis en cache 30 s. Si le serveur ne répond pas : aucune, plutôt
 * qu'un bouton qui mène à une erreur.
 */
export function loadAvailablePayments(): Promise<AvailablePayments> {
    if (availableCache && Date.now() - availableCache.at < 30 * 1000) return availableCache.value;
    const value = fetch(`${SERVER_URL}/api/public/payment-methods`)
        .then(r => r.json())
        .then(d => (d?.success
            ? { providers: d.providers || {}, paystackMobileMoney: !!d.paystack_mobile_money }
            : { providers: {}, paystackMobileMoney: false }))
        .catch(() => {
            availableCache = null; // nouvel essai au prochain appel
            return { providers: {}, paystackMobileMoney: false };
        });
    availableCache = { at: Date.now(), value };
    return value;
}

/** Position approximative du visiteur (Cloudflare), sans autorisation ni service tiers. */
export async function approximateLocation(): Promise<{ countryCode: string | null; location: { lat: number; lng: number; city: string; country: string } | null }> {
    try {
        const res = await fetch('/geo', { cache: 'no-store' });
        const g = await res.json();
        const countryCode = g.country ? String(g.country).toUpperCase() : null;
        const location = g.lat != null && g.lng != null
            ? { lat: g.lat, lng: g.lng, city: g.city || 'Inconnu', country: PAYMENT_ROUTING[countryCode || '']?.name || countryCode || 'Inconnu' }
            : null;
        return { countryCode, location };
    } catch {
        return { countryCode: null, location: null };
    }
}
