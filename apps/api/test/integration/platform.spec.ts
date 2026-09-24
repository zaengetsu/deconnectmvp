import { EmailJobs } from '../../src/modules/emails/emails.jobs';
import { EngagementService } from '../../src/modules/notifications/engagement.service';
import { EmailService } from '../../src/platform/mail/email.service';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { ENV, type Env } from '../../src/config/env';
import { ActivitiesService } from '../../src/modules/activities/activities.service';
import { DeliveryService } from '../../src/modules/notifications/delivery.service';
import { DigestService } from '../../src/modules/notifications/digest.service';
import { NotificationScheduler } from '../../src/modules/notifications/scheduler.service';
import { OfferEngine } from '../../src/modules/partners/offer-engine';
import { RitualsService } from '../../src/modules/rituals/rituals.service';
import { SocialService } from '../../src/modules/social/social.service';
import { EventBus } from '../../src/platform/events/event-bus';
import { EventRegistry } from '../../src/platform/events/event-registry';
import { JobLock } from '../../src/platform/events/job-lock';
import { OUTBOX_MAX_ATTEMPTS } from '../../src/platform/events/outbox-relay';
import { PgListener } from '../../src/platform/events/pg-listener';
import { JobsService } from '../../src/worker/jobs.service';
import { auth, familyWithChild, registerParent } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

const SUPABASE_SECRET = 'supabase-test-secret-supabase-test-secret';
function supabaseJwt(claims: Record<string, unknown>, secret = SUPABASE_SECRET): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

describe('Plateforme : outbox, verrous, worker, temps réel, pont Supabase', () => {
  let h: Harness;
  let flaky = 0;
  const seen: string[] = [];
  beforeAll(async () => {
    h = await createHarness();
    // Consommateur de test abonné à un événement réel : échoue tant que « flaky » > 0.
    h.app.get(EventRegistry).on('user.registered', 'test-flaky', async (e) => {
      seen.push(e.id);
      if (flaky > 0) {
        flaky--;
        throw new Error('panne simulée');
      }
    });
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    flaky = 0;
    seen.length = 0;
    await resetDb(h.prisma);
  });

  describe('outbox', () => {
    it('un consommateur en échec est retenté avec backoff, sans rejouer les autres', async () => {
      flaky = 2;
      const p = await registerParent(h);
      await h.drain();
      const ev = await h.prisma.outboxEvent.findFirstOrThrow({ where: { type: 'user.registered', aggregateId: p.userId } });
      expect(ev).toMatchObject({ status: 'pending', attempts: 1 });
      expect(ev.lastError).toContain('test-flaky: panne simulée');
      expect(ev.nextAttemptAt.toISOString()).toBe('2026-09-23T10:00:05.000Z');
      const mails = h.mailer.sent.length;

      h.clock.advance(5_000);
      expect(await h.relay.drain()).toMatchObject({ failed: 1 });
      h.clock.advance(10_000);
      expect(await h.relay.drain()).toMatchObject({ processed: 1 });
      expect(await h.prisma.outboxEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ status: 'published', lastError: null });
      expect(seen.filter((id) => id === ev.id)).toHaveLength(3);
      expect(h.mailer.sent.length).toBe(mails); // l'email de bienvenue n'est pas renvoyé
      const consumers = await h.prisma.processedEvent.findMany({ where: { eventId: ev.id } });
      expect(consumers.map((c) => c.consumer)).toContain('test-flaky');
    });

    it('abandon après le nombre maximal de tentatives ; relance admin', async () => {
      flaky = 1_000;
      const p = await registerParent(h);
      for (let i = 0; i < OUTBOX_MAX_ATTEMPTS; i++) {
        await h.relay.drain();
        h.clock.advance(3_600_000);
      }
      const ev = await h.prisma.outboxEvent.findFirstOrThrow({ where: { type: 'user.registered', aggregateId: p.userId } });
      expect(ev).toMatchObject({ status: 'dead', attempts: OUTBOX_MAX_ATTEMPTS });
      expect(await h.relay.drain()).toEqual({ processed: 0, failed: 0, dead: 0 });
      flaky = 0;
      await h.relay.retry(ev.id);
      expect(await h.relay.drain()).toMatchObject({ processed: 1 });
    });

    it('deux relais en parallèle ne traitent jamais le même événement deux fois', async () => {
      for (let i = 0; i < 6; i++) await registerParent(h);
      const [a, b] = await Promise.all([h.relay.drain(2), h.relay.drain(2)]);
      expect(a.processed + b.processed).toBe(6);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('registre : un consommateur ne s’abonne qu’une fois ; publication hors transaction du domaine', async () => {
      const registry = h.app.get(EventRegistry);
      expect(() => registry.on('user.registered', 'test-flaky', async () => undefined)).toThrow('déjà abonné');
      expect(registry.types()).toContain('activity.validated');
      expect(registry.handlersFor('inconnu')).toEqual([]);
      const id = randomUUID();
      await h.prisma.tx((tx) => h.app.get(EventBus).publish(tx, 'user.registered', { aggregateType: 'user', aggregateId: id, payload: { userId: id, role: 'parent', email: 'x@y.fr' } as never, actor: { kind: 'system', id: 'test' } }));
      expect(await h.prisma.outboxEvent.count({ where: { aggregateId: id } })).toBe(1);
    });
  });

  describe('worker', () => {
    it('verrou consultatif : un seul exécutant à la fois', async () => {
      const lock = h.app.get(JobLock);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const first = lock.runExclusive('test.job', async () => {
        await gate;
        return 'premier';
      });
      await new Promise((r) => setTimeout(r, 100));
      expect(await lock.runExclusive('test.job', async () => 'second')).toBeUndefined();
      release();
      expect(await first).toBe('premier');
      expect(await lock.runExclusive('test.job', async () => 'ensuite')).toBe('ensuite');
    });

    it('tâches planifiées : chaque job délègue au service métier et ne lève jamais', async () => {
      const env = { ...h.app.get<Env>(ENV), RUN_JOBS: true };
      const jobs = new JobsService(
        env,
        h.app.get(JobLock),
        h.relay,
        h.app.get(PgListener),
        h.app.get(NotificationScheduler),
        h.app.get(DeliveryService),
        h.app.get(DigestService),
        h.app.get(ActivitiesService),
        h.app.get(RitualsService),
        h.app.get(SocialService),
        h.app.get(OfferEngine),
        h.app.get(EmailService),
        h.app.get(EmailJobs),
        h.app.get(EngagementService),
      );
      const f = await familyWithChild(h);
      await jobs.drainOutbox();
      expect(await h.prisma.outboxEvent.count({ where: { status: 'pending' } })).toBe(0);
      await jobs.deliver();
      for (const job of ['releaseDue', 'housekeeping', 'parentReminders', 'familyGoals', 'dailySummaries', 'weeklySummaries', 'screenTime', 'generateRituals', 'closeRituals', 'engagementNudges', 'emailDaily', 'emailAdminDigest', 'emailParentWeekly', 'emailPartnerWeekly', 'emailMonthly', 'sendEmails'] as const) {
        await jobs[job]();
      }
      await jobs.onApplicationBootstrap();
      // Un service en panne est journalisé, pas propagé.
      const broken = new JobsService(env, { runExclusive: () => Promise.reject(new Error('base indisponible')) } as never, { drain: () => Promise.reject(new Error('x')) } as never, h.app.get(PgListener), {} as never, { processPending: () => Promise.reject(new Error('x')) } as never, {} as never, {} as never, {} as never, {} as never, {} as never, { processPending: () => Promise.reject(new Error('x')) } as never, {} as never, {} as never);
      await expect(broken.releaseDue()).resolves.toBeUndefined();
      await expect(broken.sendEmails()).resolves.toBeUndefined();
      await expect(broken.drainOutbox()).resolves.toBeUndefined();
      await expect(broken.deliver()).resolves.toBeUndefined();
      const off = new JobsService({ ...env, RUN_JOBS: false }, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
      await off.onApplicationBootstrap();
      await off.drainOutbox();
      await off.deliver();
      await expect(off.screenTime()).resolves.toBeUndefined();
      expect(f.childId).toBeTruthy();
    });

    it('LISTEN/NOTIFY : les signaux Postgres arrivent aux abonnés', async () => {
      const listener = h.app.get(PgListener);
      await expect(listener.listen('Pas-Valide', () => undefined)).rejects.toThrow('Canal invalide');
      const got = new Promise<string>((resolve) => void listener.listen('test_channel', resolve));
      await new Promise((r) => setTimeout(r, 50));
      await h.prisma.$executeRaw`SELECT pg_notify('test_channel', 'bonjour')`;
      expect(await got).toBe('bonjour');
    });
  });

  describe('temps réel', () => {
    let url: string;
    const sockets: Socket[] = [];
    beforeAll(async () => {
      await h.app.listen(0);
      url = `http://127.0.0.1:${(h.app.getHttpServer().address() as AddressInfo).port}/realtime`;
    });
    afterEach(() => sockets.splice(0).forEach((s) => s.close()));
    const connect = (token?: string) => {
      const s = io(url, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
      sockets.push(s);
      return s;
    };

    it('une notification créée est signalée dans la salle du destinataire uniquement', async () => {
      const f = await familyWithChild(h);
      const other = await registerParent(h);
      const parentSocket = connect(f.parent.token);
      const otherSocket = connect(other.token);
      await Promise.all([parentSocket, otherSocket].map((s) => new Promise<void>((r) => s.on("connect", () => r()))));
      await new Promise((r) => setTimeout(r, 100));
      const leaked: unknown[] = [];
      otherSocket.on('notification', (m) => leaked.push(m));
      const received = new Promise<{ id: string }>((resolve) => parentSocket.on('notification', resolve));
      await h.http.post('/v1/admin/notifications/test').set(auth((await (await import('../support/fixtures')).createAdmin(h)).token)).send({ recipientType: 'parent', recipientId: f.parent.userId, title: 'Hop', body: 'Temps réel' }).expect(200);
      const msg = await received;
      expect(await h.prisma.notification.findUnique({ where: { id: msg.id } })).toMatchObject({ title: 'Hop' });
      expect(leaked).toHaveLength(0);
    });

    it('connexion refusée sans jeton valide', async () => {
      const s = connect('jeton-invalide');
      const err = await new Promise<{ code: string }>((resolve) => s.on('error', resolve));
      expect(err.code).toBe('UNAUTHORIZED');
      const anon = connect();
      await new Promise((resolve) => anon.on('disconnect', resolve));
    });
  });

  describe('pont Supabase (migration de l’app mobile)', () => {
    it('jeton Supabase parent → principal parent ; enfant anonyme via auth_user_id ; jetons invalides refusés', async () => {
      const f = await familyWithChild(h, { name: 'Emma' });
      const parentJwt = supabaseJwt({ sub: f.parent.userId, role: 'authenticated' });
      const children = await h.http.get('/v1/children').set(auth(parentJwt)).expect(200);
      expect(children.body[0].displayName).toBe('Emma');

      const anonId = randomUUID();
      await h.prisma.child.update({ where: { id: f.childId }, data: { authUserId: anonId } });
      const childJwt = supabaseJwt({ sub: anonId, role: 'authenticated', is_anonymous: true });
      await h.http.get('/v1/friends').set(auth(childJwt)).expect(200);
      await h.http.get('/v1/friends').set(auth(supabaseJwt({ sub: randomUUID(), role: 'authenticated', is_anonymous: true }))).expect(401);

      // Profil Supabase sans compte API (utilisateur pas encore migré) : parent par défaut.
      const legacyId = randomUUID();
      await h.prisma.profile.create({ data: { id: legacyId, email: `legacy.${legacyId}@test.rekonect.app` } });
      await h.http.get('/v1/children').set(auth(supabaseJwt({ sub: legacyId, role: 'authenticated' }))).expect(200);

      await h.http.get('/v1/children').set(auth(supabaseJwt({ sub: f.parent.userId, role: 'anon' }))).expect(401);
      await h.http.get('/v1/children').set(auth(supabaseJwt({ sub: f.parent.userId, role: 'authenticated' }, 'mauvais-secret-mauvais-secret-mauvais'))).expect(401);
      await h.prisma.user.update({ where: { id: f.parent.userId }, data: { disabledAt: new Date() } });
      await h.http.get('/v1/children').set(auth(parentJwt)).expect(401);
    });
  });
});
