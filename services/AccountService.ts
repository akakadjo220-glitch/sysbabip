import { SERVER_URL } from '../config';

// La table profiles n'est plus lisible publiquement : les recherches de compte
// faites avant connexion passent par le serveur.

async function post(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${SERVER_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
}

export const AccountService = {
    /** E-mail du compte associé à un numéro (mode téléphone), ou null si aucun compte. */
    async resolvePhone(phone: string, fullPhone: string): Promise<string | null> {
        const { res, data } = await post('/api/auth/resolve-phone', { phone, full_phone: fullPhone });
        if (res.status === 404) return null;
        if (!res.ok || !data.success) throw new Error(data.error || 'Erreur lors de la recherche du compte.');
        return data.email;
    },

    /** Le compte existe-t-il déjà ? (e-mail, ou numéro en mode téléphone) */
    async exists(params: { email?: string; phone?: string; fullPhone?: string }): Promise<boolean> {
        const { res, data } = await post('/api/auth/account-exists', {
            email: params.email,
            phone: params.phone,
            full_phone: params.fullPhone
        });
        if (!res.ok || !data.success) throw new Error(data.error || 'Erreur lors de la vérification du compte.');
        return data.exists === true;
    }
};
