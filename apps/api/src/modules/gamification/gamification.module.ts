import { Controller, Get, Module, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';

const StatsQuery = z.object({ since: z.iso.datetime({ offset: true }).optional() });
import { GamificationService } from './gamification.service';

@Controller('v1')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  /** Points, niveau, série, badges et historique d'un enfant (parent ou enfant lui-même). */
  @Get('children/:childId/progress')
  progress(@CurrentPrincipal() p: Principal, @Param('childId', ParseUUIDPipe) childId: string) {
    return this.gamification.summary(p, childId);
  }

  /** Totaux (points gagnés et dépensés, activités validées) et détail depuis une date (semaine en cours). */
  @Get('children/:childId/stats')
  stats(@CurrentPrincipal() p: Principal, @Param('childId', ParseUUIDPipe) childId: string, @Query(zod(StatsQuery)) q: z.infer<typeof StatsQuery>) {
    return this.gamification.stats(p, childId, q.since ? new Date(q.since) : null);
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
