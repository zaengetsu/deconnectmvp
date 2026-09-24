import { Controller, Get, Module, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../../platform/auth/principal';
import { GamificationService } from './gamification.service';

@Controller('v1')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  /** Points, niveau, série, badges et historique d'un enfant (parent ou enfant lui-même). */
  @Get('children/:childId/progress')
  progress(@CurrentPrincipal() p: Principal, @Param('childId', ParseUUIDPipe) childId: string) {
    return this.gamification.summary(p, childId);
  }

  @Get('badges')
  badges() {
    return this.gamification.listBadges();
  }
}

@Module({
  controllers: [GamificationController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}
