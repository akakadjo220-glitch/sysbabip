/**
 * Utilitaires Cryptographiques pour les Billets Inviolables (Offline-First)
 * Utilise l'API Web Crypto native (zéro dépendance externe).
 */

// Clé secrète maître (idéalement injectée via variables d'environnement)
// Pour la démo avancée, on utilise une clé statique sécurisée
const MASTER_SECRET = "AFRITIX_OFLLINE_SECURE_KEY_2024_!@#$";

/**
 * Encode une chaîne en Base64Url (format requis pour JWT/JWS)
 */
const base64UrlEncode = (buffer: ArrayBuffer | Uint8Array): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

/**
 * Décode une chaîne Base64Url
 */
const base64UrlDecode = (base64Url: string): Uint8Array => {
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

/**
 * Importe la clé secrète pour l'API Web Crypto
 */
const importKey = async (): Promise<CryptoKey> => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(MASTER_SECRET);
    return await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
};

/**
 * Interface du contenu (Payload) d'un billet
 */
export interface TicketPayload {
    tId: string;       // Ticket ID
    eId: string;       // Event ID
    type: string;      // VIP, Standard, etc.
    usr: string;       // User Name/ID
    iat: number;       // Issued At (Timestamp)
}

/**
 * Signe numériquement les données d'un billet pour créer un JWS (JSON Web Signature)
 * Format final: base64(header).base64(payload).base64(signature)
 */
export const signTicket = async (payload: Omit<TicketPayload, 'iat'>): Promise<string> => {
    const encoder = new TextEncoder();
    
    // 1. Header (indique l'algorithme)
    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)));

    // 2. Payload (Les données du billet avec un timestamp d'émission)
    const fullPayload: TicketPayload = { ...payload, iat: Date.now() };
    const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));

    // 3. Contenu à signer
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    // Fallback if testing over HTTP / local IP where crypto.subtle is undefined
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
        console.warn("crypto.subtle non disponible (HTTP). Utilisation d'une signature de secours.");
        const fallbackSignature = base64UrlEncode(encoder.encode("unsecure_fallback_signature"));
        return `${dataToSign}.${fallbackSignature}`;
    }

    try {
        const key = await importKey();
        // 4. Création de la signature HMAC-SHA256
        const signatureBuffer = await crypto.subtle.sign(
            "HMAC",
            key,
            encoder.encode(dataToSign)
        );
        const encodedSignature = base64UrlEncode(signatureBuffer);
        return `${dataToSign}.${encodedSignature}`;
    } catch (err) {
        console.error("Erreur chiffrement:", err);
        const fallbackSignature = base64UrlEncode(encoder.encode("error_fallback_signature"));
        return `${dataToSign}.${fallbackSignature}`;
    }
};

/**
 * Résultat de la vérification d'un billet
 */
export interface VerificationResult {
    valid: boolean;
    reason?: 'invalid_signature' | 'malformed_token' | 'already_scanned';
    payload?: TicketPayload;
}

/**
 * Valide un billet cryptographique (JWS)
 * @param token Le contenu du QR Code
 * @param eventId L'ID de l'événement en cours (optionnel, pour restriction)
 */
export const verifyTicket = async (token: string, currentEventId?: string): Promise<VerificationResult> => {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { valid: false, reason: 'malformed_token' };
        }

        const [encodedHeader, encodedPayload, encodedSignature] = parts;
        const dataToVerify = `${encodedHeader}.${encodedPayload}`;

        const key = await importKey();
        const signatureBytes = base64UrlDecode(encodedSignature);
        const encoder = new TextEncoder();

        // 1. Vérification Cryptographique de la Signature
        const isValidSignature = await crypto.subtle.verify(
            "HMAC",
            key,
            signatureBytes as BufferSource, // Type casting to satisfy TS compiler
            encoder.encode(dataToVerify)
        );

        if (!isValidSignature) {
            return { valid: false, reason: 'invalid_signature' };
        }

        // 2. Décryptage des données pour lecture
        const decoder = new TextDecoder();
        const payloadStr = decoder.decode(base64UrlDecode(encodedPayload));
        const payload: TicketPayload = JSON.parse(payloadStr);

        // 3. (Optionnel) Vérifier si le billet correspond au bon événement
        if (currentEventId && payload.eId !== currentEventId) {
            return { valid: false, reason: 'invalid_signature' }; // ou un reason 'wrong_event'
        }

        return { valid: true, payload };
    } catch (error) {
        console.error("Erreur de décryptage:", error);
        return { valid: false, reason: 'malformed_token' };
    }
};
