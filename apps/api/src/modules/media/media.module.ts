import { Body, Controller, Delete, Get, Headers, Inject, Injectable, Module, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../platform/auth/access.service';
import { Allow, type ChildPrincipal, CurrentPrincipal, Public, type Principal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { PROOF_MAX_BYTES, type ProofContentType } from '../../platform/http/body';
import { badRequest, conflict, notFound } from '../../platform/http/errors';
import { zod } from '../../platform/http/zod.pipe';
import { PrismaService } from '../../platform/prisma/prisma.service';

export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'] as const;
const UploadInput = z.object({ dataUrl: z.string().max(3_000_000) });

/** Signatures binaires : le type déclaré doit correspondre au contenu réel. */
export function sniffImage(buf: Buffer): (typeof ALLOWED)[number] | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Preuve d'activité : photo (JPEG, PNG, WebP, GIF) ou courte vidéo (MP4, MOV), reconnue à son contenu. */
export function sniffProof(buf: Buffer): ProofContentType | null {
  const image = sniffImage(buf);
  if (image) return image;
  if (buf.length > 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) return 'image/gif';
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') return buf.toString('ascii', 8, 10) === 'qt' ? 'video/quicktime' : 'video/mp4';
  return null;
}

/** Statuts pendant lesquels l'enfant peut encore joindre ou retirer une preuve. */
const PROOF_EDITABLE = ['available', 'selected'];

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async upload(p: Principal, partnerId: string, dataUrl: string) {
    await this.access.assertPartnerMember(p, partnerId, 'editor');
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) throw badRequest('MEDIA_INVALID', 'Image PNG, JPEG ou WebP attendue');
    const data = Buffer.from(m[2], 'base64');
    if (data.length === 0 || data.length > MEDIA_MAX_BYTES) throw badRequest('MEDIA_TOO_LARGE', 'Image de 2 Mo maximum');
    const type = sniffImage(data);
    if (!type || type !== m[1]) throw badRequest('MEDIA_INVALID', 'Le fichier ne correspond pas à une image valide');
    const row = await this.prisma.mediaFile.create({
      data: { partnerId, uploadedBy: p.kind === 'user' ? p.userId : null, contentType: type, size: data.length, data, createdAt: this.clock.now() },
      select: { id: true, contentType: true, size: true },
    });
    return { ...row, url: this.urlOf(row.id) };
  }

  /**
   * Preuve envoyée par l'appareil de l'enfant avant de déclarer l'activité terminée. L'adresse renvoyée est
   * passée ensuite à POST /v1/child-activities/:id/submit (proofUrl). Remplace l'ancien bucket Supabase.
   */
  async uploadProof(p: ChildPrincipal, childActivityId: string, body: unknown, declaredType?: string) {
    const ca = await this.prisma.childActivity.findFirst({ where: { id: childActivityId, childId: p.childId }, select: { status: true } });
    if (!ca) throw notFound('CHILD_ACTIVITY_NOT_FOUND', 'Activité introuvable');
    if (!PROOF_EDITABLE.includes(ca.status)) throw conflict('PROOF_LOCKED', 'Cette activité a déjà été envoyée');
    const data = Buffer.isBuffer(body) ? body : null;
    if (!data || data.length === 0) throw badRequest('MEDIA_INVALID', 'Photo ou vidéo attendue');
    if (data.length > PROOF_MAX_BYTES) throw badRequest('MEDIA_TOO_LARGE', 'Fichier de 10 Mo maximum');
    const type = sniffProof(data);
    const declared = (declaredType ?? '').split(';')[0].trim();
    if (!type || (declared && declared.split('/')[0] !== type.split('/')[0])) throw badRequest('MEDIA_INVALID', 'Le fichier ne correspond pas à une photo ou une vidéo valide');
    const row = await this.prisma.mediaFile.create({
      data: { kind: 'proof', childId: p.childId, childActivityId, contentType: type, size: data.length, data: Uint8Array.from(data), createdAt: this.clock.now() },
      select: { id: true, contentType: true, size: true },
    });
    return { ...row, url: this.urlOf(row.id), type: type.startsWith('video/') ? ('video' as const) : ('image' as const) };
  }

  async removeProof(p: ChildPrincipal, childActivityId: string, mediaId: string) {
    const ca = await this.prisma.childActivity.findFirst({ where: { id: childActivityId, childId: p.childId }, select: { status: true } });
    if (!ca) throw notFound('CHILD_ACTIVITY_NOT_FOUND', 'Activité introuvable');
    if (!PROOF_EDITABLE.includes(ca.status)) throw conflict('PROOF_LOCKED', 'Cette activité a déjà été envoyée');
    const res = await this.prisma.mediaFile.deleteMany({ where: { id: mediaId, kind: 'proof', childActivityId, childId: p.childId } });
    if (res.count === 0) throw notFound('MEDIA_NOT_FOUND', 'Fichier introuvable');
    return { success: true };
  }

  urlOf(id: string) {
    return `${this.env.PUBLIC_API_URL.replace(/\/$/, '')}/v1/media/${id}`;
  }

  async get(id: string) {
    const row = await this.prisma.mediaFile.findUnique({ where: { id }, select: { contentType: true, data: true, kind: true } });
    if (!row) throw notFound('MEDIA_NOT_FOUND', 'Image introuvable');
    return row;
  }
}

@Controller('v1')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('partner/:partnerId/media')
  upload(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) partnerId: string, @Body(zod(UploadInput)) body: { dataUrl: string }) {
    return this.media.upload(p, partnerId, body.dataUrl);
  }

  @Post('child-activities/:id/proof')
  @Allow('child')
  uploadProof(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Headers('content-type') type?: string) {
    return this.media.uploadProof(p, id, req.body, type);
  }

  @Delete('child-activities/:id/proof/:mediaId')
  @Allow('child')
  removeProof(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.media.removeProof(p, id, mediaId);
  }

  /**
   * Public : les visuels d'offres s'affichent dans l'app et les emails. Contenu immuable.
   * Les preuves d'enfants ne sont servies qu'à qui connaît leur identifiant (aléatoire), sans cache partagé.
   */
  @Public()
  @Get('media/:id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.media.get(id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', file.kind === 'proof' ? 'private, max-age=86400' : 'public, max-age=31536000, immutable');
    if (file.kind === 'proof') res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(Buffer.from(file.data));
  }
}

@Module({ controllers: [MediaController], providers: [MediaService] })
export class MediaModule {}
