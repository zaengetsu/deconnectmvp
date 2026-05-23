import { supabase } from '../../lib/supabase';

export type ProofType = 'image' | 'video';

export interface UploadedProof {
  url: string;
  path: string;
  type: ProofType;
}

const BUCKET = 'activity-proofs';
const MAX_SIZE_MB = 10;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'];

export const storageService = {
  /**
   * Upload activity proof file to Supabase Storage.
   * Returns the public URL and storage path.
   */
  async uploadActivityProof(
    file: File,
    childId: string,
    childActivityId: string
  ): Promise<UploadedProof> {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(`Type de fichier non supporté. Utilisez une image (JPEG, PNG, WebP) ou une vidéo (MP4).`);
    }

    // Validate file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      throw new Error(`Fichier trop volumineux (max ${MAX_SIZE_MB} Mo). Taille actuelle : ${sizeMB.toFixed(1)} Mo.`);
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${childId}/${childActivityId}/${Date.now()}.${ext}`;
    const proofType: ProofType = file.type.startsWith('video/') ? 'video' : 'image';

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) throw new Error(`Erreur upload : ${error.message}`);

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return {
      url: urlData.publicUrl,
      path,
      type: proofType,
    };
  },

  /**
   * Delete a proof file from storage.
   */
  async deleteActivityProof(path: string): Promise<void> {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw new Error(`Erreur suppression : ${error.message}`);
  },

  /**
   * Get a signed URL for a proof (for private buckets).
   */
  async getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) throw new Error('Impossible de générer le lien.');
    return data.signedUrl;
  },
};
