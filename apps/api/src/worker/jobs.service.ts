import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { ENV, type Env } from '../config/env';
import { JobLock } from '../platform/events/job-lock';
import { OutboxRelay } from '../platform/events/outbox-relay';
import { PgListener } from '../platform/events/pg-listener';
import { ActivitiesService } from '../modules/activities/activities.service';
import { DeliveryService } from '../modules/notifications/delivery.service';
import { DigestService } from '../modules/notifications/digest.service';
import { NotificationScheduler } from '../modules/notifications/scheduler.service';
import { OfferEngine } from '../modules/partners/offer-engine';
import { RitualsService } from '../modules/rituals/rituals.service';
import { SocialService } from '../modules/social/social.service';

const TZ = 'Europe/Paris';

/**
 * Travaux du worker (remplace pg_cron + pg_net + Edge Functions) :
 * - temps réel : relais outbox et livraisons réveillés par LISTEN/NOTIFY, avec filet de sécurité périodique ;
 * - planifiés : un seul worker les exécute grâce au verrou consultatif, même avec plusieurs réplicas.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs');
  private draining = false;
  private delivering = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly lock: JobLock,
    private readonly relay: OutboxRelay,
    private readonly listener: PgListener,
    private readonly scheduler: NotificationScheduler,
    private readonly deliveries: DeliveryService,
    private readonly digests: DigestService,
    private readonly activities: ActivitiesService,
    private readonly rituals: RitualsService,
    private readonly social: SocialService,
    private readonly offers: OfferEngine,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.RUN_JOBS) return;
    await this.listener.listen('outbox', () => void this.drainOutbox());
    await this.listener.listen('deliveries', () => void this.deliver());
    void this.drainOutbox();
    this.logger.log('Worker prêt : outbox, livraisons et tâches planifiées actifs');
  }

  @Interval(2000)
  async drainOutbox(): Promise<void> {
    if (!this.env.RUN_JOBS || this.draining) return;
    this.draining = true;
    try {
      await this.relay.drain();
    } catch (err) {
      this.logger.error(`Relais outbox : ${(err as Error).message}`);
    } finally {
      this.draining = false;
    }
  }

  @Interval(5000)
  async deliver(): Promise<void> {
    if (!this.env.RUN_JOBS || this.delivering) return;
    this.delivering = true;
    try {
      while ((await this.deliveries.processPending(100)) === 100);
    } catch (err) {
      this.logger.error(`Livraisons : ${(err as Error).message}`);
    } finally {
      this.delivering = false;
    }
  }

  private run(name: string, fn: () => Promise<unknown>): Promise<unknown> {
    if (!this.env.RUN_JOBS) return Promise.resolve(undefined);
    return this.lock.runExclusive(name, fn).catch((err: Error) => this.logger.error(`${name} : ${err.message}`));
  }

  @Cron(CronExpression.EVERY_MINUTE)
  releaseDue() {
    return this.run('notifications.release', () => this.scheduler.releaseDue());
  }

  @Cron('0 */15 * * * *')
  housekeeping() {
    return this.run('housekeeping', async () => {
      await this.activities.expireOverdue();
      await this.social.expireDuos();
      await this.offers.expire();
    });
  }

  @Cron('30 17 * * *', { timeZone: TZ })
  parentReminders() {
    return this.run('notifications.parent-reminders', () => this.digests.parentContextReminders());
  }

  @Cron('0 18 * * *', { timeZone: TZ })
  familyGoals() {
    return this.run('rituals.goals', () => this.rituals.checkAllGoals());
  }

  @Cron('30 19 * * *', { timeZone: TZ })
  dailySummaries() {
    return this.run('notifications.daily-summary', () => this.digests.dailySummaries());
  }

  @Cron('0 18 * * 0', { timeZone: TZ })
  weeklySummaries() {
    return this.run('notifications.weekly-summary', () => this.digests.weeklySummaries());
  }

  @Cron('0 9 * * *', { timeZone: TZ })
  screenTime() {
    return this.run('notifications.screen-time', () => this.digests.screenTime());
  }

  @Cron('0 4 * * *', { timeZone: TZ })
  generateRituals() {
    return this.run('rituals.generate', () => this.rituals.generateAll());
  }

  @Cron(CronExpression.EVERY_HOUR)
  closeRituals() {
    return this.run('rituals.close', () => this.rituals.closePast());
  }
}
