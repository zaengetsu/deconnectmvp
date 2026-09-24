import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { DomainError } from './errors';

/** Valide un corps ou une query avec un schéma de @rekonect/contracts. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw new DomainError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', details[0]?.message ?? 'Données invalides', details);
    }
    return result.data;
  }
}

export const zod = <T>(schema: ZodType<T>) => new ZodPipe(schema);
