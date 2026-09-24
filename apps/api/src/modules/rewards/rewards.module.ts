import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateRewardInput, HandleRewardRequestInput, UpdateRewardInput } from '@rekonect/contracts';
import { z } from 'zod';
import { Allow, type ChildPrincipal, CurrentPrincipal, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';
import { EntitlementsModule } from '../billing/billing.module';
import { GamificationModule } from '../gamification/gamification.module';
import { PartnersModule } from '../partners/partners.module';
import { RewardsService } from './rewards.service';

const ListQuery = z.object({ childId: z.uuid().optional() });
const RequestsQuery = z.object({ childId: z.uuid().optional(), status: z.enum(['pending', 'approved', 'rejected', 'completed']).optional() });
const ActivateInput = z.object({ childId: z.uuid().optional() });

@Controller('v1')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get('rewards')
  list(@CurrentPrincipal() p: Principal, @Query(zod(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.rewards.list(p, q.childId);
  }

  @Get('rewards/catalog')
  @Allow('parent')
  catalog(@CurrentPrincipal() p: UserPrincipal) {
    return this.rewards.catalog(p);
  }

  @Post('rewards/catalog/:id/activate')
  @Allow('parent')
  activate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(ActivateInput)) body: z.infer<typeof ActivateInput>) {
    return this.rewards.activate(p, id, body.childId);
  }

  @Post('rewards')
  @Allow('parent')
  create(@CurrentPrincipal() p: UserPrincipal, @Body(zod(CreateRewardInput)) body: CreateRewardInput) {
    return this.rewards.create(p, body);
  }

  @Patch('rewards/:id')
  @Allow('parent')
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(UpdateRewardInput)) body: UpdateRewardInput) {
    return this.rewards.update(p, id, body);
  }

  @Delete('rewards/:id')
  @Allow('parent')
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.rewards.remove(p, id);
  }

  @Post('rewards/:id/request')
  @Allow('child')
  request(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.rewards.request(p, id);
  }

  @Get('reward-requests')
  requests(@CurrentPrincipal() p: Principal, @Query(zod(RequestsQuery)) q: z.infer<typeof RequestsQuery>) {
    return this.rewards.listRequests(p, q);
  }

  @Post('reward-requests/:id/approve')
  @Allow('parent')
  @HttpCode(200)
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(HandleRewardRequestInput)) body: { note?: string }) {
    return this.rewards.approve(p, id, body.note);
  }

  @Post('reward-requests/:id/reject')
  @Allow('parent')
  @HttpCode(200)
  reject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(HandleRewardRequestInput)) body: { note?: string }) {
    return this.rewards.reject(p, id, body.note);
  }

  @Post('reward-requests/:id/deliver')
  @Allow('parent')
  @HttpCode(200)
  deliver(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.rewards.deliver(p, id);
  }
}

@Module({
  imports: [GamificationModule, PartnersModule, EntitlementsModule],
  controllers: [RewardsController],
  providers: [RewardsService],
})
export class RewardsModule {}
