import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ActivitiesModule } from '../modules/activities/activities.module';
import { EmailsCoreModule } from '../modules/emails/emails.module';
import { GamificationModule } from '../modules/gamification/gamification.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { NotificationsCoreModule } from '../modules/notifications/notifications.module';
import { PartnersModule } from '../modules/partners/partners.module';
import { RitualsModule } from '../modules/rituals/rituals.module';
import { SocialModule } from '../modules/social/social.module';
import { PlatformModule } from '../platform/platform.module';
import { JobsService } from './jobs.service';

/**
 * Processus worker : pas de HTTP. Il charge les modules qui consomment des événements
 * (leurs abonnements s'enregistrent au démarrage) et exécute les tâches planifiées.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    PlatformModule,
    IdentityModule,
    GamificationModule,
    ActivitiesModule,
    SocialModule,
    RitualsModule,
    PartnersModule,
    NotificationsCoreModule,
    EmailsCoreModule,
  ],
  providers: [JobsService],
})
export class WorkerModule {}
