import { MediaModule } from './modules/media/media.module';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AdminModule } from './modules/admin/admin.module';
import { BillingModule } from './modules/billing/billing.module';
import { FamiliesModule } from './modules/families/families.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PartnersModule } from './modules/partners/partners.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { RitualsModule } from './modules/rituals/rituals.module';
import { ScreenTimeModule } from './modules/screen-time/screen-time.module';
import { SocialModule } from './modules/social/social.module';
import { AuthGuard } from './platform/auth/auth.guard';
import { Public } from './platform/auth/principal';
import { HttpErrorFilter } from './platform/http/errors';
import { PlatformModule } from './platform/platform.module';
import { PrismaService } from './platform/prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

/** Modules métier : chacun est extractible en service indépendant (voir docs/architecture.md). */
export const DOMAIN_MODULES = [
  IdentityModule,
  FamiliesModule,
  GamificationModule,
  ActivitiesModule,
  RewardsModule,
  SocialModule,
  RitualsModule,
  ScreenTimeModule,
  PartnersModule,
  BillingModule,
  NotificationsModule,
  AdminModule,
  MediaModule,
];

@Module({
  imports: [PlatformModule, ...DOMAIN_MODULES],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
