import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Erreur métier : un code stable (utilisé par les clients) + un message lisible en français.
 */
export class DomainError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const notFound = (code: string, message = 'Élément introuvable') =>
  new DomainError(HttpStatus.NOT_FOUND, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'Action non autorisée') =>
  new DomainError(HttpStatus.FORBIDDEN, code, message);
export const conflict = (code: string, message: string) => new DomainError(HttpStatus.CONFLICT, code, message);
export const badRequest = (code: string, message: string, details?: unknown) =>
  new DomainError(HttpStatus.BAD_REQUEST, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Authentification requise') =>
  new DomainError(HttpStatus.UNAUTHORIZED, code, message);
export const tooMany = (code: string, message: string, details?: unknown) =>
  new DomainError(HttpStatus.TOO_MANY_REQUESTS, code, message, details);

/** Format d'erreur unique de l'API : { code, message, details? }. */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'code' in body) {
        res.status(status).json(body);
        return;
      }
      const message = typeof body === 'string' ? body : ((body as { message?: unknown }).message ?? exception.message);
      res.status(status).json({ code: HttpStatus[status] ?? 'ERROR', message });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Une erreur inattendue est survenue' });
  }
}
