import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../../generated/prisma/client';
import { ENV, type Env } from '../../config/env';

/** Client de transaction : ce que reçoivent les services pour écrire de façon atomique. */
export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }

  /** Transaction interactive avec délais adaptés aux traitements par lots. */
  tx<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number }): Promise<T> {
    return this.$transaction(fn, { timeout: opts?.timeout ?? 15_000, maxWait: 10_000 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

export { Prisma };
