import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env, loadEnv } from '../config/env';
import { AccessService } from './auth/access.service';
import { TokenVerifier } from './auth/token-verifier';
import { BrevoMailer, Mailer } from './mail/mailer';
import { Clock } from './clock';
import { EventBus } from './events/event-bus';
import { EventRegistry } from './events/event-registry';
import { JobLock } from './events/job-lock';
import { OutboxRelay } from './events/outbox-relay';
import { PgListener } from './events/pg-listener';
import { PrismaService } from './prisma/prisma.service';

/** Socle transversal : base, horloge, événements, accès, JWT. */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: env.JWT_ACCESS_TTL_SECONDS, algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    PrismaService,
    Clock,
    EventBus,
    EventRegistry,
    OutboxRelay,
    PgListener,
    JobLock,
    AccessService,
    TokenVerifier,
    { provide: Mailer, useClass: BrevoMailer },
  ],
  exports: [ENV, PrismaService, Clock, EventBus, EventRegistry, OutboxRelay, PgListener, JobLock, AccessService, TokenVerifier, Mailer],
})
export class PlatformModule {}
