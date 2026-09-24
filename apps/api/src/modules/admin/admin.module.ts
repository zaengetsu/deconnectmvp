import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  AdminEventQuery,
  AdminFamilyQuery,
  AdminNotificationQuery,
  CATALOG_STATUSES,
  CreateAdminInput,
  CreateBadgeInput,
  CreateCatalogRewardInput,
  CreateCategoryInput,
  PageQuery,
  RangeQuery,
  TestNotificationInput,
} from '@rekonect/contracts';
import { z } from 'zod';
import { Allow } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsCoreModule } from '../notifications/notifications.module';
import { PartnersModule } from '../partners/partners.module';
import { ModerationService } from '../partners/moderation.service';
import { AdminActivityInput, AdminService } from './admin.service';

const ActivitiesQuery = PageQuery.extend({
  q: z.string().max(100).optional(),
  categoryId: z.uuid().optional(),
  status: z.enum(CATALOG_STATUSES).optional(),
  origin: z.enum(['all', 'catalog', 'partner']).default('catalog'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const DisableInput = z.object({ disabled: z.boolean() });
const UpdateCatalogRewardInput = CreateCatalogRewardInput.partial().extend({ isActive: z.boolean().optional() });
const ImportInput = z.object({ csv: z.string().min(1).max(500_000) });
const ResolveInput = z.object({ resolution: z.string().min(2).max(500), status: z.enum(['published', 'archived']).optional() });
const DeleteFamilyInput = z.object({ confirmEmail: z.string().min(3) });
const SearchQuery = z.object({ q: z.string().max(100).default('') });

@Controller('v1/admin')
@Allow('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly moderation: ModerationService,
  ) {}

  // ─── Pilotage ───
  @Get('overview')
  overview(@Query(zod(RangeQuery)) q: { days: number }) {
    return this.admin.overview(q.days);
  }

  @Get('overview/active-families')
  activeFamilies() {
    return this.admin.activeFamiliesByMonth();
  }

  @Get('overview/top-activities')
  topActivities(@Query(zod(RangeQuery)) q: { days: number }) {
    return this.admin.topActivities(q.days);
  }

  @Get('overview/top-rewards')
  topRewards(@Query(zod(RangeQuery)) q: { days: number }) {
    return this.admin.topRewards(q.days);
  }

  @Get('nav-counts')
  async navCounts() {
    return { pendingOffers: await this.moderation.pendingCount() };
  }

  @Get('search')
  search(@Query(zod(SearchQuery)) q: { q: string }) {
    return this.admin.search(q.q);
  }

  // ─── Catalogue ───
  @Get('activities')
  activities(@Query(zod(ActivitiesQuery)) q: z.infer<typeof ActivitiesQuery>) {
    return this.admin.activities(q);
  }

  @Get('activities/:id')
  activity(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.activityDetail(id);
  }

  @Post('activities')
  createActivity(@Body(zod(AdminActivityInput)) body: AdminActivityInput) {
    return this.admin.createActivity(body);
  }

  @Patch('activities/:id')
  updateActivity(@Param('id', ParseUUIDPipe) id: string, @Body(zod(AdminActivityInput.partial())) body: Partial<AdminActivityInput>) {
    return this.admin.updateActivity(id, body);
  }

  @Post('activities/import')
  @HttpCode(200)
  importActivities(@Body(zod(ImportInput)) body: { csv: string }) {
    return this.admin.importActivities(body.csv);
  }

  @Get('activity-reports')
  reports() {
    return this.admin.reports();
  }

  @Post('activities/:id/resolve-reports')
  @HttpCode(200)
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body(zod(ResolveInput)) body: z.infer<typeof ResolveInput>) {
    return this.admin.resolveReports(id, body.resolution, body.status);
  }

  @Post('categories')
  createCategory(@Body(zod(CreateCategoryInput)) body: z.infer<typeof CreateCategoryInput>) {
    return this.admin.createCategory(body);
  }

  @Get('rewards')
  rewards() {
    return this.admin.catalogRewards();
  }

  @Post('rewards')
  createReward(@Body(zod(CreateCatalogRewardInput)) body: z.infer<typeof CreateCatalogRewardInput>) {
    return this.admin.createCatalogReward(body);
  }

  @Patch('rewards/:id')
  updateReward(@Param('id', ParseUUIDPipe) id: string, @Body(zod(UpdateCatalogRewardInput)) body: z.infer<typeof UpdateCatalogRewardInput>) {
    return this.admin.updateCatalogReward(id, body);
  }

  @Post('badges')
  createBadge(@Body(zod(CreateBadgeInput)) body: z.infer<typeof CreateBadgeInput>) {
    return this.admin.createBadge(body);
  }

  // ─── Familles ───
  @Get('families/stats')
  familyStats() {
    return this.admin.familyStats();
  }

  @Get('families')
  families(@Query(zod(AdminFamilyQuery)) q: z.infer<typeof AdminFamilyQuery>) {
    return this.admin.families(q);
  }

  @Get('families/:id')
  family(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.family(id);
  }

  @Post('families/:id/resend-login')
  @HttpCode(200)
  resendLogin(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.resendLogin(id);
  }

  @Delete('families/:id')
  deleteFamily(@Param('id', ParseUUIDPipe) id: string, @Body(zod(DeleteFamilyInput)) body: { confirmEmail: string }) {
    return this.admin.deleteFamily(id, body.confirmEmail);
  }

  @Patch('users/:id/disabled')
  disable(@Param('id', ParseUUIDPipe) id: string, @Body(zod(DisableInput)) body: { disabled: boolean }) {
    return this.admin.setUserDisabled(id, body.disabled);
  }

  // ─── Supervision ───
  @Get('notifications')
  notifications(@Query(zod(AdminNotificationQuery)) q: z.infer<typeof AdminNotificationQuery>) {
    return this.admin.notificationLog(q);
  }

  @Post('notifications/test')
  @HttpCode(200)
  test(@Body(zod(TestNotificationInput)) body: z.infer<typeof TestNotificationInput>) {
    return this.admin.sendTest(body);
  }

  @Get('events')
  events(@Query(zod(AdminEventQuery)) q: z.infer<typeof AdminEventQuery>) {
    return this.admin.events(q);
  }

  @Post('events/:id/retry')
  @HttpCode(200)
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.retryEvent(id);
  }

  @Get('admins')
  admins() {
    return this.admin.admins();
  }

  @Post('admins')
  createAdmin(@Body(zod(CreateAdminInput)) body: z.infer<typeof CreateAdminInput>) {
    return this.admin.createAdmin(body);
  }
}

@Module({
  imports: [NotificationsCoreModule, IdentityModule, PartnersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
