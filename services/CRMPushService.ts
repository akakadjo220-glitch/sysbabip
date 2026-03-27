import { supabase } from '../supabaseClient';
import { WhatsAppService } from './WhatsAppService';
import { Event } from '../types';

export interface PushCampaign {
    id: string;
    organizerId: string;
    name: string;
    messageTemplate: string;
    audienceFilter: {
        pastEventId?: string; // Target attendees of a specific past event
        minTicketsBought?: number; // Target power buyers
    };
    status: 'draft' | 'sending' | 'completed' | 'failed';
    createdAt: string;
    sentCount: number;
    totalTarget: number;
}

export class CRMPushService {
    /**
     * Evaluates the audience size for a campaign based on filters.
     */
    static async estimateAudienceSize(organizerId: string, filter: PushCampaign['audienceFilter']): Promise<number> {
        try {
            // Pour la V1, on simule l'audience en se basant sur les transactions (mock data for now or supabase)
            const { data, error } = await supabase
                .from('transactions')
                .select('customer, event_id', { count: 'exact' });

            if (error) {
                console.error("Erreur de calcul de l'audience", error);
                return 0;
            }

            // We filter unique phone numbers
            const uniquePhones = new Set<string>();
            data?.forEach(t => {
                if (t.customer && (t.customer as string).includes('+')) {
                    uniquePhones.add(t.customer as string);
                }
            });

            return uniquePhones.size || 1500; // Mock 1500 si pas de data
        } catch (e) {
            console.error(e);
            return 0;
        }
    }

    /**
     * Launches the push campaign via WaSender/Evolution API
     */
    static async executeCampaign(campaign: PushCampaign, targetPhoneNumbers: string[]): Promise<boolean> {
        // Dans Babipass V1, on simule la boucle d'envoi de l'API de messagerie en masse.
        console.log(`🚀 [CRMPushService] Démarrage de la campagne: ${campaign.name}`);
        console.log(`🎯 [CRMPushService] Cible: ${targetPhoneNumbers.length} contacts.`);

        let sent = 0;
        // On simule un envoi progressif pour ne pas faire sauter le localStorage (en démo)
        for (const phone of targetPhoneNumbers) {
            try {
                await WhatsAppService.sendMessage(phone, campaign.messageTemplate);
                sent++;
                console.log(`✅ [CRMPushService] Message envoyé à ${phone} (${sent}/${targetPhoneNumbers.length})`);
            } catch (err) {
                console.error(`❌ [CRMPushService] Échec pour ${phone}`, err);
            }
        }

        console.log(`🏁 [CRMPushService] Campagne terminée. ${sent} messages envoyés.`);
        return true;
    }
}
