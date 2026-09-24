import type { NestExpressApplication } from '@nestjs/platform-express';

/** Types acceptés pour les preuves d'activité envoyées en binaire (photo ou courte vidéo). */
export const PROOF_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'] as const;
export type ProofContentType = (typeof PROOF_CONTENT_TYPES)[number];
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Analyseurs de corps communs à l'API et aux tests :
 *  - JSON jusqu'à 3 Mo (visuels partenaires en base64, 2 Mo décodés) ;
 *  - binaire brut pour les preuves d'activité (10 Mo, photo ou vidéo).
 */
export function applyBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '3mb' });
  app.useBodyParser('raw', { type: [...PROOF_CONTENT_TYPES], limit: PROOF_MAX_BYTES + 1024 });
}
