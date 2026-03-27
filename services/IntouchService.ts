/**
 * AfriTix — InTouch Service (Production)
 * Sends payment requests to the secure Express proxy server.
 * Secret keys never leave the server.
 */

const SERVER_URL = 'https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io';

export const IntouchService = {
    processMobilePayment: async ({ phone, amount, provider }: { phone: string; amount: number; provider: string }) => {
        console.log(`[InTouch] Initiating ${provider} payment for ${amount} XOF to ${phone}`);

        const response = await fetch(`${SERVER_URL}/api/pay/intouch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, amount, provider })
        });

        const data = await response.json();

        if (data.success) {
            return {
                success: true,
                transactionId: data.transactionId,
                message: data.message || 'Paiement InTouch initié. Veuillez confirmer sur votre téléphone.',
                status: data.status || 'pending'
            };
        } else {
            console.error('[InTouch] Payment failed:', data.error);
            throw new Error(data.error || 'Paiement InTouch échoué.');
        }
    }
};
