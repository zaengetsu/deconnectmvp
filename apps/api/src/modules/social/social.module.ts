import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CreateDuoInput, FriendRequestInput } from '@rekonect/contracts';
import { z } from 'zod';
import { Allow, type ChildPrincipal, CurrentPrincipal, type Principal, type UserPrincipal } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';
import { GamificationModule } from '../gamification/gamification.module';
import { SocialService } from './social.service';

const FriendsQuery = z.object({ childId: z.uuid().optional() });

@Controller('v1')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('friends')
  friends(@CurrentPrincipal() p: Principal, @Query(zod(FriendsQuery)) q: z.infer<typeof FriendsQuery>) {
    return this.social.friends(p, q.childId);
  }

  @Post('friends')
  @Allow('child')
  request(@CurrentPrincipal() p: ChildPrincipal, @Body(zod(FriendRequestInput)) body: { friendChildId: string }) {
    return this.social.requestFriend(p, body.friendChildId);
  }

  @Post('friends/:id/approve')
  @Allow('parent')
  @HttpCode(200)
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.social.decideFriend(p, id, true);
  }

  @Post('friends/:id/decline')
  @Allow('parent')
  @HttpCode(200)
  decline(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.social.decideFriend(p, id, false);
  }

  @Get('duos')
  @Allow('child')
  duos(@CurrentPrincipal() p: ChildPrincipal) {
    return this.social.duos(p);
  }

  @Post('duos')
  @Allow('child')
  create(@CurrentPrincipal() p: ChildPrincipal, @Body(zod(CreateDuoInput)) body: CreateDuoInput) {
    return this.social.createDuo(p, body);
  }

  @Post('duos/:id/accept')
  @Allow('child')
  @HttpCode(200)
  accept(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.social.respondDuo(p, id, true);
  }

  @Post('duos/:id/decline')
  @Allow('child')
  @HttpCode(200)
  decline2(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.social.respondDuo(p, id, false);
  }

  @Post('duos/:id/cancel')
  @Allow('child')
  @HttpCode(200)
  cancel(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.social.cancelDuo(p, id);
  }

  @Post('duos/:id/done')
  @Allow('child')
  @HttpCode(200)
  done(@CurrentPrincipal() p: ChildPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.social.completePart(p, id);
  }
}

@Module({
  imports: [GamificationModule],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
