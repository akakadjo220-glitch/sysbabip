// services/WhatsAppService.ts

/**
 * Service to handle integration with WA Sender API
 * URL: https://wasenderapi.com/api/send-message
 */
import { getPlatformSetting } from '../utils/platformSettings';

// Configuration is now pulled dynamically from Supabase platform_settings
const WASENDER_API_URL = 'https://wasenderapi.com/api/send-message';

export const WhatsAppService = {
    /**
     * Send a standard text message via WhatsApp
     */
    async sendMessage(phone: string, message: string) {
        try {
            const cleanPhone = phone.replace(/[^0-9]/g, '');

            const waConfig = await getPlatformSetting<{
                provider: string;
                instanceId: string;
                token: string;
                evolutionUrl: string;
                evolutionInstance: string;
                evolutionApiKey: string;
            }>('wa_config');

            if (!waConfig) throw new Error("WaSender configuration missing. Please configure in Admin Settings.");

            if (waConfig.provider === 'evolution') {
                if (!waConfig.evolutionUrl || !waConfig.evolutionInstance || !waConfig.evolutionApiKey) {
                    throw new Error("Configuration Evolution API incomplète.");
                }
                console.log(`[WhatsAppService/Evolution] Sending to ${cleanPhone} via Instance ${waConfig.evolutionInstance}`);

                const response = await fetch(`${waConfig.evolutionUrl}/message/sendText/${waConfig.evolutionInstance}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': waConfig.evolutionApiKey
                    },
                    body: JSON.stringify({
                        number: cleanPhone,
                        textMessage: { text: message }
                    })
                });

                if (!response.ok) {
                    throw new Error(`Evolution API Error: ${response.statusText}`);
                }
                const data = await response.json();
                console.log('[Evolution API Response]', data);
                return { success: true, message: `Message envoyé à ${cleanPhone}`, data };
            } else {
                if (!waConfig.token || !waConfig.instanceId) {
                    throw new Error("WaSender Token or Instance ID missing.");
                }

                console.log(`[WhatsAppService/WaSender] Sending to ${cleanPhone} via Instance ${waConfig.instanceId}`);

                const response = await fetch(`${WASENDER_API_URL}?instance_id=${waConfig.instanceId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${waConfig.token}`
                    },
                    body: JSON.stringify({
                        number: cleanPhone,
                        message: message,
                        type: 'text'
                    })
                });

                if (!response.ok) {
                    throw new Error(`WaSender API Error: ${response.statusText}`);
                }
                const data = await response.json();
                console.log('[WaSender API Response]', data);
                return { success: true, message: `Message envoyé à ${cleanPhone}`, data };
            }

        } catch (error: any) {
            console.error('WhatsAppService Error (sendMessage):', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Send a media message (like an Image/QR Code) via WhatsApp
     */
    async sendMediaMessage(phone: string, message: string, mediaUrl: string) {
        try {
            const cleanPhone = phone.replace(/[^0-9]/g, '');

            const waConfig = await getPlatformSetting<{
                provider: string;
                instanceId: string;
                token: string;
                evolutionUrl: string;
                evolutionInstance: string;
                evolutionApiKey: string;
            }>('wa_config');

            if (!waConfig) throw new Error("WaSender configuration missing.");

            if (waConfig.provider === 'evolution') {
                if (!waConfig.evolutionUrl || !waConfig.evolutionInstance || !waConfig.evolutionApiKey) {
                    throw new Error("Configuration Evolution API incomplète.");
                }
                console.log(`[WhatsAppService/Evolution] Sending Media to ${cleanPhone} via Instance ${waConfig.evolutionInstance}`);
                console.log(`[Media Payload]`, { mediaUrl, message });

                const response = await fetch(`${waConfig.evolutionUrl}/message/sendMedia/${waConfig.evolutionInstance}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': waConfig.evolutionApiKey
                    },
                    body: JSON.stringify({
                        number: cleanPhone,
                        mediaMessage: {
                            mediatype: 'image',
                            caption: message,
                            media: mediaUrl
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`Evolution API Error: ${response.statusText}`);
                }
                const data = await response.json();
                console.log('[WhatsAppService/Evolution API Media Response]', data);
                return { success: true, data };
            } else {
                console.log(`[WhatsAppService/WaSender] Sending Media to ${cleanPhone} via Instance ${waConfig.instanceId}`);
                console.log(`[Media Payload]`, { mediaUrl, message });
                const response = await fetch(`${WASENDER_API_URL}?instance_id=${waConfig.instanceId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${waConfig.token}`
                    },
                    body: JSON.stringify({
                        number: cleanPhone,
                        message: message,
                        media_url: mediaUrl,
                        type: 'media'
                    })
                });

                if (!response.ok) {
                    throw new Error(`WaSender API Error: ${response.statusText}`);
                }
                const data = await response.json();
                console.log('[WaSender API Media Response]', data);
                return { success: true, data };
            }
        } catch (error: any) {
            console.error('WhatsAppService Error (sendMediaMessage):', error);
            return { success: false, error: error.message };
        }
    }
};
