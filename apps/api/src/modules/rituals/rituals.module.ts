import { Body, Controller, Get, HttpCode, Injectable, Module, OnModuleInit, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ConfirmOccurrenceInput, CreateRitualInput, SetFamilyGoalInput, UpdateRitualInput } from '@rekonect/contracts';
import { Allow, CurrentPrincipal, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { EventRegistry } from '../../platform/events/event-registry';
import { zod } from '../../platform/http/zod.pipe';
import { GamificationModule } from '../gamification/gamification.module';
import { RitualsService } from './rituals.service';

@Controller('v1')
export class RitualsController {
  constructor(private readonly rituals: RitualsService) {}

  @Get('rituals')
  @Allow('parent')
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.rituals.list(p);
  }

  @Post('rituals')
  @Allow('parent')
  create(@CurrentPrincipal() p: UserPrincipal, @Body(zod(CreateRitualInput)) body: CreateRitualInput) {
    return this.rituals.create(p, body);
  }

  @Patch('rituals/:id')
  @Allow('parent')
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(UpdateRitualInput)) body: UpdateRitualInput) {
    return this.rituals.update(p, id, body);
  }

  @Get('ritual-occurrences')
  occurrences(@CurrentPrincipal() p: Principal) {
    return this.rituals.occurrences(p);
  }

  @Post('ritual-occurrences/:id/confirm')
  @Allow('parent')
  @HttpCode(200)
  confirm(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(ConfirmOccurrenceInput)) body: { attendees: string[] }) {
    return this.rituals.confirm(p, id, body.attendees);
  }

  @Post('ritual-occurrences/:id/cancel')
  @Allow('parent')
  @HttpCode(200)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.rituals.cancel(p, id);
  }

  @Get('family-goal')
  @Allow('parent')
  goal(@CurrentPrincipal() p: UserPrincipal) {
    return this.rituals.goal(p);
  }

  @Put('family-goal')
  @Allow('parent')
  setGoal(@CurrentPrincipal() p: UserPrincipal, @Body(zod(SetFamilyGoalInput)) body: { targetActivities: number }) {
    return this.rituals.setGoal(p, body.targetActivities);
  }
}

/** L'objectif familial est recalculé à chaque activité validée, en temps réel. */
@Injectable()
export class RitualsConsumers implements OnModuleInit {
  constructor(
    private readonly registry: EventRegistry,
    private readonly rituals: RitualsService,
  ) {}

  onModuleInit(): void {
    this.registry.on('activity.validated', 'rituals.goal', async (e, tx) => {
      await this.rituals.checkGoal(e.payload.parentId, tx);
    });
  }
}

@Module({
  imports: [GamificationModule],
  controllers: [RitualsController],
  providers: [RitualsService, RitualsConsumers],
  exports: [RitualsService],
})
export class RitualsModule {}
