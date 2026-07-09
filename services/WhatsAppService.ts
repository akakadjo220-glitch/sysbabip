// services/WhatsAppService.ts

/**
 * Service to handle WhatsApp notifications (securely relayed and queued on the backend)
 */
import { SERVER_URL } from '../config';

export const WhatsAppService = {
    /**
     * Send a standard text message via WhatsApp (queued securely on the backend)
     */
    async sendMessage(phone: string, message: string) {
        try {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const relayUrl = `${SERVER_URL}/api/send-whatsapp`;

            const response = await fetch(relayUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone: cleanPhone,
                    message: message
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Erreur lors de la mise en file d'attente WhatsApp.");
            }

            const data = await response.json();
            return { success: true, message: `Message mis en file d'attente pour ${cleanPhone}`, data };

        } catch (error: any) {
            console.error('WhatsAppService Error (sendMessage):', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Send a media message (like an Image/QR Code) via WhatsApp (queued securely on the backend)
     */
    async sendMediaMessage(phone: string, message: string, mediaUrl: string) {
        try {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const relayUrl = `${SERVER_URL}/api/send-whatsapp`;

            const response = await fetch(relayUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone: cleanPhone,
                    message: message,
                    mediaUrl: mediaUrl
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Erreur lors de la mise en file d'attente WhatsApp.");
            }

            const data = await response.json();
            return { success: true, message: `Message média mis en file d'attente pour ${cleanPhone}`, data };

        } catch (error: any) {
            console.error('WhatsAppService Error (sendMediaMessage):', error);
            return { success: false, error: error.message };
        }
    }
};
