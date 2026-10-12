/**
 * Babipass — Achat de billets côté serveur.
 *
 * Le navigateur crée une commande ; le serveur calcule le prix, réserve les
 * places, lance le paiement chez l'opérateur, vérifie lui-même le paiement et
 * émet les billets. Le navigateur se contente de suivre le statut.
 */
import { SERVER_URL } from '../config';

export type CheckoutProvider = 'paystack' | 'pawapay' | 'feexpay' | 'intouch' | 'paydunya';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'amount_mismatch' | 'refund_required';

export interface CreateOrderInput {
  eventId: string;
  items: Record<string, number>;
  paymentMode: 'full' | 'installment';
  provider: CheckoutProvider;
  buyer: { name?: string; email?: string; phone?: string; contactMethod: 'email' | 'wa' };
  buyerLocation?: any;
  referralCode?: string | null;
  payment?: { phone?: string; network?: string; countryCode?: string };
}

export interface CreatedOrder {
  order: { id: string; token: string; amount_due: number; total_amount: number; currency: string; quantity: number; expires_at: string };
  payment: { publicKey?: string; reference?: string; amount?: number; currency?: string; email?: string; message?: string };
}

export interface IssuedTicket {
  id: string;
  qr_code: string;
  ticket_type: string;
  status: string;
  guest_name: string;
}

export class CheckoutError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new CheckoutError(data.error || 'Erreur serveur.', data.code);
  return data;
}

export interface PhysicalQuote {
  category_name: string;
  unit_price: number;
  rate: number;
  quantity: number;
  free_quantity: number;
  billable_quantity: number;
  commission: number;
  max_batch: number;
}

export const CheckoutService = {
  /** Contribution à une levée de fonds (enregistrée après vérification du paiement). */
  async createDonation(input: {
    campaignId: string; amount: number; provider: CheckoutProvider;
    buyer: { name?: string; email?: string }; payment?: CreateOrderInput['payment'];
  }): Promise<CreatedOrder> {
    return postJson('/api/checkout/donations', {
      campaign_id: input.campaignId,
      amount: input.amount,
      provider: input.provider,
      buyer: input.buyer,
      payment: input.payment ?? {},
    });
  },

  /** Tranche suivante d'un achat en paiement fractionné (montant calculé par le serveur). */
  async createInstallment(ticketId: string, provider: CheckoutProvider, payment?: CreateOrderInput['payment']): Promise<CreatedOrder> {
    return postJson('/api/checkout/installments', { ticket_id: ticketId, provider, payment: payment ?? {} });
  },

  /** Billets physiques : devis, génération et paiement de la commission (organisateur connecté). */
  physical: {
    async quote(accessToken: string, eventId: string, categoryId: string, quantity: number): Promise<PhysicalQuote> {
      const data = await postJson('/api/physical/quote', { event_id: eventId, category_id: categoryId, quantity },
        { Authorization: `Bearer ${accessToken}` });
      return data.quote;
    },
    async createBatch(accessToken: string, eventId: string, categoryId: string, quantity: number)
      : Promise<{ status: 'ok' | 'payment_required'; ticket_ids?: string[]; method?: string; quote: PhysicalQuote }> {
      return postJson('/api/physical/batches', { event_id: eventId, category_id: categoryId, quantity },
        { Authorization: `Bearer ${accessToken}` });
    },
    async createCommissionOrder(accessToken: string, eventId: string, categoryId: string, quantity: number,
      provider: CheckoutProvider, payment?: CreateOrderInput['payment']): Promise<CreatedOrder> {
      return postJson('/api/physical/commission-orders',
        { event_id: eventId, category_id: categoryId, quantity, provider, payment: payment ?? {} },
        { Authorization: `Bearer ${accessToken}` });
    },
  },

  /**
   * Ouvre le popup Paystack pour une commande créée par le serveur et résout
   * quand l'utilisateur a terminé (true) ou fermé le popup (false). Le résultat
   * du popup n'est pas une preuve : appeler ensuite waitForPayment.
   */
  openPaystack(created: CreatedOrder): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const PaystackPop = (window as any).PaystackPop;
      if (!PaystackPop) {
        reject(new CheckoutError("Le script de paiement Paystack n'est pas chargé. Veuillez rafraîchir la page."));
        return;
      }
      const p = created.payment;
      PaystackPop.setup({
        key: p.publicKey,
        email: p.email,
        amount: p.amount,
        currency: p.currency,
        channels: ['card', 'mobile_money'],
        ref: p.reference,
        callback: () => resolve(true),
        onClose: () => resolve(false),
      }).openIframe();
    });
  },

  /**
   * Crée la commande. Pendant un pic, le serveur peut répondre « file d'attente »
   * (429, code QUEUE) : on patiente le délai indiqué puis on réessaie, jusqu'à
   * maxWaitMs ; onQueued permet d'afficher l'attente à l'acheteur.
   */
  async createOrder(
    input: CreateOrderInput,
    { onQueued, maxWaitMs = 10 * 60 * 1000 }: { onQueued?: (retryAfterS: number, attempt: number) => void; maxWaitMs?: number } = {}
  ): Promise<CreatedOrder> {
    const body = JSON.stringify({
      event_id: input.eventId,
      items: input.items,
      payment_mode: input.paymentMode,
      provider: input.provider,
      buyer: {
        name: input.buyer.name,
        email: input.buyer.email,
        phone: input.buyer.phone,
        contact_method: input.buyer.contactMethod,
      },
      buyer_location: input.buyerLocation ?? null,
      referral_code: input.referralCode ?? null,
      payment: input.payment ?? {},
    });
    const deadline = Date.now() + maxWaitMs;

    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${SERVER_URL}/api/checkout/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) return data as CreatedOrder;

      if (res.status === 429 && data.code === 'QUEUE' && Date.now() < deadline) {
        const retryAfterS = Math.max(1, Number(data.retry_after || res.headers.get('Retry-After') || 3));
        onQueued?.(retryAfterS, attempt);
        await new Promise(resolve => setTimeout(resolve, retryAfterS * 1000));
        continue;
      }
      throw new CheckoutError(data.error || 'Impossible de créer la commande.', data.code);
    }
  },

  async getOrderStatus(orderId: string, token: string): Promise<{ status: OrderStatus; tickets?: IssuedTicket[]; fully_paid?: boolean; amount_paid?: number; total_amount?: number }> {
    const res = await fetch(`${SERVER_URL}/api/checkout/orders/${orderId}?token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new CheckoutError(data.error || 'Erreur de vérification du paiement.');
    return data;
  },

  /**
   * Attend la confirmation du paiement (vérifiée par le serveur auprès de
   * l'opérateur). Résout dès que la commande n'est plus « pending ».
   */
  async waitForPayment(
    orderId: string,
    token: string,
    { timeoutMs = 5 * 60 * 1000, intervalMs = 4000, signal }: { timeoutMs?: number; intervalMs?: number; signal?: { cancelled: boolean } } = {}
  ): Promise<{ status: OrderStatus; tickets?: IssuedTicket[]; fully_paid?: boolean; amount_paid?: number; total_amount?: number }> {
    const deadline = Date.now() + timeoutMs;
    let last: { status: OrderStatus; tickets?: IssuedTicket[]; fully_paid?: boolean } = { status: 'pending' };
    while (Date.now() < deadline && !signal?.cancelled) {
      try {
        last = await this.getOrderStatus(orderId, token);
        if (last.status !== 'pending') return last;
      } catch (err) {
        console.warn('[Checkout] Statut indisponible, nouvel essai…', err);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return last;
  },
};
