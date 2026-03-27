/**
 * AfriTix — FeexPay Service (Production)
 * Sends payment requests to the secure Express proxy server.
 * Secret keys never leave the server.
 */

const SERVER_URL = 'https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io';

export const FeexpayService = {
    /**
     * Initiate a mobile money payment via FeexPay (through secure server proxy)
     */
    processMobileMoney: async ({ phone, amount, country, network }: { phone: string; amount: number; country: string; network: string }) => {
        console.log(`[FeexPay] Initiating ${network} payment for ${amount} XOF to ${phone}`);

        const response = await fetch(`${SERVER_URL}/api/pay/feexpay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, amount, network })
        });

        const data = await response.json();

        if (data.success) {
            return {
                success: true,
                transactionId: data.transactionId,
                message: data.message || 'Veuillez valider le paiement sur votre téléphone.',
                status: data.status || 'pending'
            };
        } else {
            console.error('[FeexPay] Payment failed:', data.error);
            throw new Error(data.error || 'Paiement FeexPay échoué.');
        }
    },

    checkTransactionStatus: async (transactionId: string) => {
        // Status check could be added to the server proxy as well
        console.log(`[FeexPay] Checking status for ${transactionId}`);
        return { success: true, status: 'successful' };
    }
};
