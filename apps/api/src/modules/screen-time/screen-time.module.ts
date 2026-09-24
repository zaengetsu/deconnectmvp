import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { RecordScreenTimeInput } from '@rekonect/contracts';
import { z } from 'zod';
import { AccessService } from '../../platform/auth/access.service';
import { CurrentPrincipal, type Principal } from '../../platform/auth/principal';
import { Clock } from '../../platform/clock';
import { familyTimeZone } from '../../platform/family-tz';
import { zod } from '../../platform/http/zod.pipe';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { addDays, dateColumnToIso, isoToDateColumn, localDateString } from '../../platform/time';

/**
 * Relevés de temps d'écran. La mesure elle-même viendra des API natives (Screen Time / Digital Wellbeing) ;
 * l'API reçoit un total quotidien, depuis l'appareil de l'enfant ou saisi par le parent.
 */
@Injectable()
export class ScreenTimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly clock: Clock,
  ) {}

  async record(p: Principal, childId: string, input: RecordScreenTimeInput) {
    const child = await this.access.assertCanReadChild(p, childId);
    const day = input.day ?? localDateString(this.clock.now(), await familyTimeZone(this.prisma, child.parentId));
    const row = await this.prisma.screenTimeDaily.upsert({
      where: { childId_day: { childId, day: isoToDateColumn(day) } },
      create: { childId, day: isoToDateColumn(day), minutes: input.minutes, goalMinutes: input.goalMinutes ?? null },
      update: { minutes: input.minutes, ...(input.goalMinutes != null ? { goalMinutes: input.goalMinutes } : {}) },
    });
    return { ...row, day: dateColumnToIso(row.day) };
  }

  async history(p: Principal, childId: string, days: number) {
    const child = await this.access.assertCanReadChild(p, childId);
    const today = localDateString(this.clock.now(), await familyTimeZone(this.prisma, child.parentId));
    const rows = await this.prisma.screenTimeDaily.findMany({
      where: { childId, day: { gte: isoToDateColumn(addDays(today, -days + 1)) } },
      orderBy: { day: 'asc' },
    });
    const total = rows.reduce((s, r) => s + r.minutes, 0);
    return {
      days: rows.map((r) => ({ day: dateColumnToIso(r.day), minutes: r.minutes, goalMinutes: r.goalMinutes })),
      averageMinutes: rows.length ? Math.round(total / rows.length) : 0,
      goalsReached: rows.filter((r) => r.goalMinutes != null && r.minutes <= r.goalMinutes).length,
    };
  }
}

const HistoryQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(14) });

@Controller('v1/children/:childId/screen-time')
export class ScreenTimeController {
  constructor(private readonly screenTime: ScreenTimeService) {}

  @Put()
  record(@CurrentPrincipal() p: Principal, @Param('childId', ParseUUIDPipe) childId: string, @Body(zod(RecordScreenTimeInput)) body: RecordScreenTimeInput) {
    return this.screenTime.record(p, childId, body);
  }

  @Get()
  history(@CurrentPrincipal() p: Principal, @Param('childId', ParseUUIDPipe) childId: string, @Query(zod(HistoryQuery)) q: { days: number }) {
    return this.screenTime.history(p, childId, q.days);
  }
}

@Module({ controllers: [ScreenTimeController], providers: [ScreenTimeService] })
export class ScreenTimeModule {}
