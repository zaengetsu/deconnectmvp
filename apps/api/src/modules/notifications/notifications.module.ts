import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { NotificationListQuery, RegisterPushTokenInput, UpdatePreferencesInput } from '@rekonect/contracts';
import { z } from 'zod';
import { Allow, CurrentPrincipal, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';
import { NotificationCenterService } from './center.service';
import { ProviderPushTransport, PushTransport } from './channels/push';
import { NotificationConsumers } from './consumers';
import { DeliveryService } from './delivery.service';
import { DigestService } from './digest.service';
import { EngagementService } from './engagement.service';
import { NotificationService } from './notification.service';
import { RealtimeGateway } from './realtime.gateway';
import { NotificationScheduler } from './scheduler.service';

const PrefsQuery = z.object({ childId: z.uuid().optional() });
const UnregisterInput = z.object({ token: z.string().min(10) });

@Controller('v1')
export class NotificationsController {
  constructor(private readonly center: NotificationCenterService) {}

  @Get('notifications')
  list(@CurrentPrincipal() p: Principal, @Query(zod(NotificationListQuery)) q: NotificationListQuery) {
    return this.center.list(p, q);
  }

  @Get('notifications/unread-count')
  unread(@CurrentPrincipal() p: Principal) {
    return this.center.unreadCount(p);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  readAll(@CurrentPrincipal() p: Principal) {
    return this.center.markAllRead(p);
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  read(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.center.markRead(p, id, true);
  }

  @Post('notifications/:id/unread')
  @HttpCode(200)
  unreadOne(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.center.markRead(p, id, false);
  }

  @Delete('notifications/:id')
  remove(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.center.remove(p, id);
  }

  @Get('notification-preferences')
  @Allow('parent')
  prefs(@CurrentPrincipal() p: UserPrincipal, @Query(zod(PrefsQuery)) q: z.infer<typeof PrefsQuery>) {
    return this.center.preferences(p, q.childId);
  }

  @Put('notification-preferences')
  @Allow('parent')
  updatePrefs(@CurrentPrincipal() p: UserPrincipal, @Query(zod(PrefsQuery)) q: z.infer<typeof PrefsQuery>, @Body(zod(UpdatePreferencesInput)) body: UpdatePreferencesInput) {
    return this.center.updatePreferences(p, body, q.childId);
  }

  @Post('push-tokens')
  @Allow('parent', 'child')
  @HttpCode(200)
  register(@CurrentPrincipal() p: Principal, @Body(zod(RegisterPushTokenInput)) body: RegisterPushTokenInput) {
    return this.center.registerPushToken(p, body);
  }

  @Post('push-tokens/unregister')
  @Allow('parent', 'child')
  @HttpCode(200)
  unregister(@CurrentPrincipal() p: Principal, @Body(zod(UnregisterInput)) body: { token: string }) {
    return this.center.unregisterPushToken(p, body.token);
  }
}

const core = [
  NotificationService,
  NotificationScheduler,
  DeliveryService,
  DigestService,
  EngagementService,
  NotificationConsumers,
  { provide: PushTransport, useClass: ProviderPushTransport },
];

/** Moteur (décision, programmation, livraison, consommateurs) : utilisé par l'API et le worker. */
@Module({ providers: core, exports: [NotificationService, NotificationScheduler, DeliveryService, DigestService, EngagementService, PushTransport] })
export class NotificationsCoreModule {}

/** Surface HTTP + WebSocket : uniquement dans le processus API. */
@Module({
  imports: [NotificationsCoreModule],
  controllers: [NotificationsController],
  providers: [NotificationCenterService, RealtimeGateway],
})
export class NotificationsModule {}
