import { supabase } from '../supabaseClient';
import { SERVER_URL } from '../config';

/**
 * Service d'upload unifié.
 * Téléverse vers Chevereto si activé dans les configurations d'administration,
 * sinon utilise le stockage Supabase classique par défaut.
 *
 * @param file Le fichier à téléverser
 * @param bucket Le bucket Supabase par défaut (KYC, documents, events...)
 * @param path Le chemin du fichier par défaut dans Supabase
 * @returns L'URL publique directe du fichier téléversé
 */
export async function uploadFile(file: File, bucket: string, path: string): Promise<string> {
  try {
    // 1. Récupérer la configuration de Chevereto
    const { data, error: fetchErr } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'chevereto_config')
      .maybeSingle();

    if (fetchErr) {
      console.warn('[UploadService] Impossible de récupérer la config Chevereto, repli sur Supabase:', fetchErr.message);
    }

    const config = data?.value as { enabled: boolean; apiUrl: string } | null;

    // 2. Si activé, envoyer sur Chevereto via le Proxy Backend Express
    if (config && config.enabled && config.apiUrl) {
      console.log(`[UploadService] Stockage Chevereto actif. Envoi du fichier ${file.name}...`);
      
      const formData = new FormData();
      formData.append('source', file);

      // Appel de l'API Proxy du backend
      const response = await fetch(`${SERVER_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur serveur d'upload (Status: ${response.status})`);
      }

      const result = await response.json();
      if (!result.url) {
        throw new Error("L'URL du média n'a pas été retournée par le serveur");
      }

      return result.url;
    }

    // 3. Sinon, repli sur Supabase Storage
    console.log(`[UploadService] Stockage Chevereto inactif. Envoi du fichier ${file.name} vers Supabase...`);
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      throw uploadErr;
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(uploadData.path);
    if (!urlData || !urlData.publicUrl) {
      throw new Error("Impossible de générer l'URL publique Supabase");
    }

    return urlData.publicUrl;

  } catch (err: any) {
    console.error('[UploadService Error]', err);
    throw err;
  }
}
