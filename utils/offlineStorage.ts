
// Utilitaire de chiffrement AES-GCM pour le stockage local sécurisé
// Ne nécessite aucune librairie externe

const STORE_KEY = 'afritix_secure_wallet';
const ENCRYPTION_KEY_NAME = 'afritix_key';

// Générer ou récupérer une clé de chiffrement persistante
async function getEncryptionKey(): Promise<CryptoKey> {
  // Dans une vraie app, cette clé pourrait dériver du mot de passe utilisateur
  // Pour cette démo, on génère une clé stockée en localstorage (pas ultra secure mais simule le concept)
  const storedKeyJson = localStorage.getItem(ENCRYPTION_KEY_NAME);

  if (storedKeyJson) {
    const keyData = JSON.parse(storedKeyJson);
    return window.crypto.subtle.importKey(
      "jwk",
      keyData,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const exportedKey = await window.crypto.subtle.exportKey("jwk", key);
  localStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(exportedKey));

  return key;
}

// Chiffrer les données
export async function saveSecureTicket(ticketData: any): Promise<void> {
  try {
    const existing = getStoredEncryptedData();
    
    // Fallback for non-HTTPS connections where crypto.subtle is undefined
    if (!window.crypto || !window.crypto.subtle) {
      console.warn("crypto.subtle non disponible (HTTP). Sauvegarde sans chiffrement.");
      existing.push({
        unencrypted: true,
        content: ticketData,
        timestamp: Date.now()
      });
      localStorage.setItem(STORE_KEY, JSON.stringify(existing));
      console.log("Billet sauvegardé SANS CHIFFREMENT (Fallback local).");
      return;
    }

    const key = await getEncryptionKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(JSON.stringify(ticketData));

    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encodedData
    );

    // On stocke le tableau d'octets converti en Array normal pour le JSON
    const storageItem = {
      iv: Array.from(iv),
      content: Array.from(new Uint8Array(encryptedContent)),
      timestamp: Date.now()
    };

    existing.push(storageItem);
    localStorage.setItem(STORE_KEY, JSON.stringify(existing));
    console.log("Billet sauvegardé et chiffré en local.");
  } catch (e) {
    console.error("Erreur chiffrement", e);
  }
}

function getStoredEncryptedData(): any[] {
  const raw = localStorage.getItem(STORE_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Déchiffrer et récupérer tous les billets
export async function getOfflineTickets(): Promise<any[]> {
  try {
    const rawItems = getStoredEncryptedData();
    if (rawItems.length === 0) return [];

    const tickets = [];
    let key: CryptoKey | null = null;
    
    if (window.crypto && window.crypto.subtle) {
      try {
        key = await getEncryptionKey();
      } catch(e) { console.warn("Could not get encryption key:", e); }
    }

    for (const item of rawItems) {
      if (item.unencrypted) {
        tickets.push(item.content);
        continue;
      }
      
      try {
        if (!key || !window.crypto || !window.crypto.subtle) continue;
        
        const iv = new Uint8Array(item.iv);
        const content = new Uint8Array(item.content);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: iv },
          key,
          content
        );

        const decoded = new TextDecoder().decode(decryptedBuffer);
        tickets.push(JSON.parse(decoded));
      } catch (err) {
        console.warn("Impossible de déchiffrer un billet (clé invalide ?)", err);
      }
    }

    return tickets;
  } catch (e) {
    console.error("Erreur récupération billets", e);
    return [];
  }
}

// Supprimer un billet sécurisé (utile pour le transfert et la revente)
export async function removeSecureTicket(ticketId: string): Promise<boolean> {
  try {
    const rawItems = getStoredEncryptedData();
    if (rawItems.length === 0) return false;

    const key = await getEncryptionKey();
    const updatedRawItems = [];
    let ticketFound = false;

    // Déchiffrer un par un pour trouver l'ID
    for (const item of rawItems) {
      try {
        const iv = new Uint8Array(item.iv);
        const content = new Uint8Array(item.content);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: iv },
          key,
          content
        );

        const decoded = new TextDecoder().decode(decryptedBuffer);
        const ticketData = JSON.parse(decoded);

        if (ticketData.id === ticketId || ticketData.qrCode?.includes(ticketId)) {
          ticketFound = true;
          // On n'ajoute pas cet item pour le "supprimer"
        } else {
          updatedRawItems.push(item);
        }
      } catch (err) {
        // En cas d'erreur de décryptage d'un vieux blob, on le garde tel quel pour ne pas corrompre
        updatedRawItems.push(item);
      }
    }

    if (ticketFound) {
      localStorage.setItem(STORE_KEY, JSON.stringify(updatedRawItems));
      console.log(`Billet ${ticketId} retiré du portefeuille sécurisé.`);
      return true;
    }

    return false;
  } catch (e) {
    console.error("Erreur suppression billet sécurisé", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// OFFLINE TICKET SCANNER (SYNC QUEUE)
// ---------------------------------------------------------------------------

const SYNC_QUEUE_KEY = 'afritix_offline_scans_queue';
const LOCAL_GUEST_LIST_KEY = 'afritix_local_guest_list';

export interface ScannedTicketLog {
  ticketId: string;
  eventId: string;
  scannedAt: string;
  scannerId: string;
}

/**
 * Simulates downloading a cryptographically signed guest list for a specific event
 * En vrai, ceci appellerait Supabase pour charger le dump en cache local.
 */
export const downloadGuestList = async (eventId: string): Promise<number> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulation: on stocke un indicateur que la liste est chargée
      localStorage.setItem(`${LOCAL_GUEST_LIST_KEY}_${eventId}`, JSON.stringify({
        downloadedAt: new Date().toISOString(),
        count: 50 // Nombre simulé de billets attendus
      }));
      resolve(50);
    }, 1500);
  });
};

/**
 * Retrieves the currently pending scans waiting to be synced to the master server.
 */
export const getPendingOfflineScans = (eventId?: string): ScannedTicketLog[] => {
  const rawQueue = localStorage.getItem(SYNC_QUEUE_KEY);
  if (!rawQueue) return [];
  const queue: ScannedTicketLog[] = JSON.parse(rawQueue);
  if (eventId) {
    return queue.filter(scan => scan.eventId === eventId);
  }
  return queue;
};

/**
 * Adds a successfully scanned ticket to the local sync queue.
 * Ensures duplicates aren't added.
 */
export const queueOfflineScan = (ticketId: string, eventId: string, scannerId: string = 'admin'): boolean => {
  const currentQueue = getPendingOfflineScans();

  // Check for local duplicate
  if (currentQueue.some(scan => scan.ticketId === ticketId)) {
    return false; // Already scanned locally
  }

  const newScan: ScannedTicketLog = {
    ticketId,
    eventId,
    scannedAt: new Date().toISOString(),
    scannerId
  };

  currentQueue.push(newScan);
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(currentQueue));
  return true;
};

/**
 * Attempts to flush the sync queue to the master server (Supabase).
 */
export const syncOfflineScans = async (eventId?: string): Promise<{ success: boolean; count: number; error?: string }> => {
  const queue = getPendingOfflineScans(eventId);

  if (queue.length === 0) {
    return { success: true, count: 0 };
  }

  return new Promise((resolve, reject) => {
    // Simulation: Push to Supabase RPC / Backend endpoint
    setTimeout(() => {
      if (Math.random() > 0.1) { // 90% chance of network success
        // Clear the synced items from the queue
        const fullQueue = getPendingOfflineScans();
        const remainingQueue = fullQueue.filter(scan =>
          eventId ? scan.eventId !== eventId : false // Remove the synced ones
        );

        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remainingQueue));

        console.log(`[SyncEngine] Successfully pushed ${queue.length} offline scans to master server.`);
        resolve({ success: true, count: queue.length });
      } else {
        // Network Failure simulation
        reject({ success: false, count: 0, error: 'Network timeout during synchronization.' });
      }
    }, 2000);
  });
};
