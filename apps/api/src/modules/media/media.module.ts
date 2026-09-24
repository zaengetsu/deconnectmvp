import { Body, Controller, Get, Inject, Injectable, Module, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../platform/auth/access.service';
import { CurrentPrincipal, Public, type Principal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { badRequest, notFound } from '../../platform/http/errors';
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
    return { ...row, url: `${this.env.PUBLIC_API_URL.replace(/\/$/, '')}/v1/media/${row.id}` };
  }

  async get(id: string) {
    const row = await this.prisma.mediaFile.findUnique({ where: { id }, select: { contentType: true, data: true } });
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

  /** Public : les visuels d'offres s'affichent dans l'app et les emails. Contenu immuable. */
  @Public()
  @Get('media/:id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.media.get(id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(Buffer.from(file.data));
  }
}

@Module({ controllers: [MediaController], providers: [MediaService] })
export class MediaModule {}
