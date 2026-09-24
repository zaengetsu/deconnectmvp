import { Injectable, Logger } from '@nestjs/common';
import { sha256 } from '../crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Clé 64 bits stable pour pg_advisory_lock, dérivée du nom du job. */
export function lockKey(name: string): bigint {
  return BigInt.asIntN(64, BigInt('0x' + sha256(name).slice(0, 16)));
}

/**
 * Exécute un job planifié sur un seul worker à la fois, quel que soit le nombre de réplicas :
 * verrou consultatif de session Postgres, pris sans attente.
 */
@Injectable()
export class JobLock {
  private readonly logger = new Logger('Jobs');

  constructor(private readonly prisma: PrismaService) {}

  async runExclusive<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    const key = lockKey(name);
    return this.prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${key}) AS locked`;
        if (!locked) return undefined;
        const started = Date.now();
        try {
          return await fn();
        } finally {
          this.logger.debug(`${name} terminé en ${Date.now() - started} ms`);
        }
      },
      { timeout: 10 * 60_000, maxWait: 10_000 },
    );
  }
}
