import { api } from '../../lib/api';

export type ProofType = 'image' | 'video';

export interface UploadedProof {
  url: string;
  /** Identifiant du fichier côté API (sert à le retirer avant l'envoi). */
  path: string;
  type: ProofType;
  /** Activité à laquelle la preuve est rattachée. */
  childActivityId?: string;
}

const MAX_SIZE_MB = 10;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'];

/**
 * Preuves d'activité (photo ou courte vidéo), envoyées à l'API Rekonect.
 * Le fichier est rattaché à l'activité de l'enfant connecté ; il ne peut plus être
 * modifié une fois l'activité déclarée terminée.
 */
export const storageService = {
  async uploadActivityProof(file: File, _childId: string, childActivityId: string): Promise<UploadedProof> {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error('Type de fichier non supporté. Utilisez une image (JPEG, PNG, WebP) ou une vidéo (MP4).');
    }
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      throw new Error(`Fichier trop volumineux (max ${MAX_SIZE_MB} Mo). Taille actuelle : ${sizeMB.toFixed(1)} Mo.`);
    }
    const res = await api<{ id: string; url: string; type: ProofType }>('POST', `/v1/child-activities/${childActivityId}/proof`, undefined, {
      raw: { data: file, contentType: file.type },
    });
    return { url: res.url, path: res.id, type: res.type, childActivityId };
  },

  /** Retire une preuve pas encore envoyée. */
  async deleteActivityProof(path: string, childActivityId?: string): Promise<void> {
    if (!childActivityId) return;
    await api('DELETE', `/v1/child-activities/${childActivityId}/proof/${path}`);
  },
};
