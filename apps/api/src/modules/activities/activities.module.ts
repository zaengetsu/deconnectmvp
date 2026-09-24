import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ActivityQuery,
  AssignActivityInput,
  CreateActivityInput,
  RejectActivityInput,
  ReportActivityInput,
  SelectActivityInput,
  SubmitActivityInput,
  UpdateActivityInput,
  ValidateActivityInput,
} from '@rekonect/contracts';
import { z } from 'zod';
import { Allow, type ChildPrincipal, CurrentPrincipal, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';
import { EntitlementsModule } from '../billing/billing.module';
import { GamificationModule } from '../gamification/gamification.module';
import { ActivitiesService } from './activities.service';

const StatusQuery = z.object({ status: z.enum(['available', 'selected', 'submitted', 'validated', 'rejected']).optional() });
const StartInput = SelectActivityInput.extend({ activityId: z.uuid() });

@Controller('v1')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get('activity-categories')
  categories() {
    return this.activities.categories();
  }

  @Get('activities')
  list(@CurrentPrincipal() p: Principal, @Query(zod(ActivityQuery)) q: ActivityQuery) {
    return this.activities.list(p, q);
  }

  @Post('activities/:id/report')
  @Allow('parent')
  report(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(ReportActivityInput)) body: z.infer<typeof ReportActivityInput>) {
    return this.activities.report(p, id, body);
  }

  @Get('activities/:id')
  get(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.activities.get(p, id);
  }

  @Post('activities')
  @Allow('parent')
  create(@CurrentPrincipal() p: UserPrincipal, @Body(zod(CreateActivityInput)) body: CreateActivityInput) {
    return this.activities.create(p, body);
  }

  @Patch('activities/:id')
  @Allow('parent')
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(UpdateActivityInput)) body: UpdateActivityInput) {
    return this.activities.update(p, id, body);
  }

  @Get('children/:childId/activities')
  forChild(@CurrentPrincipal() p: Principal, @Param('childId', ParseUUIDPipe) childId: string, @Query(zod(StatusQuery)) q: z.infer<typeof StatusQuery>) {
    return this.activities.listForChild(p, childId, q.status);
  }

  @Get('children/:childId/daily-challenges')
  daily(@CurrentPrincipal() p: Principal, @Param('childId', ParseUUIDPipe) childId: string) {
    return this.activities.dailyChallenges(p, childId);
  }

  @Post('children/:childId/activities')
  @Allow('parent')
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('childId', ParseUUIDPipe) childId: string, @Body(zod(AssignActivityInput)) body: AssignActivityInput) {
    return this.activities.assign(p, childId, body);
  }

  @Get('validations')
  @Allow('parent')
  validations(@CurrentPrincipal() p: UserPrincipal) {
    return this.activities.pendingValidations(p);
  }

  // ─── Actions enfant ───
  @Post('child-activities')
  @Allow('child')
  start(@CurrentPrincipal() p: ChildPrincipal, @Body(zod(StartInput)) body: z.infer<typeof StartInput>) {
    return this.activities.select(p, body);
  }

  @Post('child-activities/:id/start')
  @Allow('child')
  @HttpCode(200)
  startAssigned(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(SelectActivityInput)) body: z.infer<typeof SelectActivityInput>) {
    return this.activities.select(p, { childActivityId: id, scheduledFor: body.scheduledFor });
  }

  @Post('child-activities/:id/submit')
  @Allow('child')
  @HttpCode(200)
  submit(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(SubmitActivityInput)) body: SubmitActivityInput) {
    return this.activities.submit(p, id, body);
  }

  @Post('child-activities/:id/abandon')
  @Allow('child')
  @HttpCode(200)
  abandon(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.activities.abandon(p, id);
  }

  // ─── Actions parent ───
  @Post('child-activities/:id/validate')
  @Allow('parent')
  @HttpCode(200)
  validate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(ValidateActivityInput)) body: { note?: string }) {
    return this.activities.validate(p, id, body.note);
  }

  @Post('child-activities/:id/reject')
  @Allow('parent')
  @HttpCode(200)
  reject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(RejectActivityInput)) body: { reason?: string }) {
    return this.activities.reject(p, id, body.reason);
  }
}

@Module({
  imports: [GamificationModule, EntitlementsModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
