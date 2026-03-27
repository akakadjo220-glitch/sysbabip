/**
 * AfriTix — PawaPay Service (Production)
 * Sends payment requests to the secure Express proxy server.
 * Secret keys never leave the server.
 */

const SERVER_URL = 'https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io';

export class PawaPayService {
    static async requestUSSDPush(phoneNumber: string, amount: number, network: string): Promise<{ success: boolean; pawaId: string }> {
        console.log(`[PawaPayService] Initiating ${network} deposit for ${amount} XOF to ${phoneNumber}`);

        const response = await fetch(`${SERVER_URL}/api/pay/pawapay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneNumber, amount, network })
        });

        const data = await response.json();

        if (data.success) {
            return { success: true, pawaId: data.transactionId };
        } else {
            console.error('[PawaPayService] Payment failed:', data.error);
            throw new Error(data.error || 'Paiement PawaPay échoué.');
        }
    }
}
