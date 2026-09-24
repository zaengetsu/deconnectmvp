import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { applyBodyParsers } from '../../src/platform/http/body';
import request from 'supertest';
import { seed } from '../../prisma/seed';
import { AppModule } from '../../src/app.module';
import { BillingGateway, FakeBillingGateway } from '../../src/modules/billing/gateway';
import { DeliveryService } from '../../src/modules/notifications/delivery.service';
import { EmailJobs } from '../../src/modules/emails/emails.jobs';
import { DigestService } from '../../src/modules/notifications/digest.service';
import { EngagementService } from '../../src/modules/notifications/engagement.service';
import { EmailService } from '../../src/platform/mail/email.service';
import { FakePushTransport, PushTransport } from '../../src/modules/notifications/channels/push';
import { NotificationScheduler } from '../../src/modules/notifications/scheduler.service';
import { Clock, FixedClock } from '../../src/platform/clock';
import { OutboxRelay } from '../../src/platform/events/outbox-relay';
import { Mailer, MemoryMailer } from '../../src/platform/mail/mailer';
import { PrismaService } from '../../src/platform/prisma/prisma.service';

export const TEST_NOW = new Date('2026-09-23T10:00:00.000Z'); // mercredi 12h, heure de Paris

export interface Harness {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  clock: FixedClock;
  mailer: MemoryMailer;
  push: FakePushTransport;
  billing: FakeBillingGateway;
  relay: OutboxRelay;
  scheduler: NotificationScheduler;
  deliveries: DeliveryService;
  digests: DigestService;
  emails: EmailService;
  emailJobs: EmailJobs;
  engagement: EngagementService;
  /** Traite tous les événements en attente (comme le ferait le worker). */
  drain(): Promise<void>;
  close(): Promise<void>;
}

/** Vide toutes les tables puis recharge le catalogue de référence : chaque test part d'un état connu. */
let plansSnapshot: Record<string, unknown>[] | null = null;

export async function resetDb(prisma: PrismaService): Promise<void> {
  // Les plans sont des données de référence posées par la migration : on les restaure au lieu de les vider.
  plansSnapshot ??= await prisma.plan.findMany();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'plans'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  for (const plan of plansSnapshot) {
    const { id, ...data } = plan as { id: string } & Record<string, unknown>;
    await prisma.plan.update({ where: { id }, data: data as never });
  }
  await seed(prisma as unknown as Parameters<typeof seed>[0]);
}

export async function createHarness(): Promise<Harness> {
  const clock = new FixedClock(TEST_NOW);
  const mailer = new MemoryMailer();
  const push = new FakePushTransport();
  const billing = new FakeBillingGateway();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(Mailer)
    .useValue(mailer)
    .overrideProvider(PushTransport)
    .useValue(push)
    .overrideProvider(BillingGateway)
    .useValue(billing)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false, rawBody: true });
  applyBodyParsers(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const relay = app.get(OutboxRelay);

  return {
    app,
    http: request(app.getHttpServer()),
    prisma,
    clock,
    mailer,
    push,
    billing,
    relay,
    scheduler: app.get(NotificationScheduler),
    deliveries: app.get(DeliveryService),
    digests: app.get(DigestService),
    emails: app.get(EmailService),
    emailJobs: app.get(EmailJobs),
    engagement: app.get(EngagementService),
    async drain() {
      // Plusieurs passes : un consommateur peut publier de nouveaux événements.
      for (let i = 0; i < 5; i++) {
        const r = await relay.drain();
        if (r.processed + r.failed + r.dead === 0) break;
      }
      // Puis la file d'emails, comme le ferait le worker.
      await app.get(EmailService).processPending(500);
    },
    close: () => app.close(),
  };
}
