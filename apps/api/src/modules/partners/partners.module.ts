import { Body, Controller, Delete, Get, Header, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  AudienceQuery,
  CreateOfferInput,
  ImportCodesInput,
  InvitePartnerMemberInput,
  OFFER_KINDS,
  OFFER_STATUSES,
  PARTNER_LEAD_STATUSES,
  PARTNER_MEMBER_ROLES,
  PartnerLeadInput,
  PlaceInput,
  RangeQuery,
  RejectOfferInput,
  RequestChangesInput,
  SetPartnerStatusInput,
  UpdateOfferInput,
  UpdatePartnerInput,
  UpdatePartnerLeadInput,
  UpdatePlaceInput,
  VerifyCodeInput,
} from '@rekonect/contracts';
import { z } from 'zod';
import { AccessService } from '../../platform/auth/access.service';
import { Allow, CurrentPrincipal, type Principal, Public, type UserPrincipal } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { EntitlementsModule } from '../billing/billing.module';
import { PARTNER_REWARDS } from '../rewards/partner-rewards.port';
import { AudienceService } from './audience.service';
import { PartnerLeadsService } from './leads.service';
import { ModerationService } from './moderation.service';
import { OfferEngine } from './offer-engine';
import { OffersService } from './offers.service';
import { PartnerStatsService } from './partner-stats.service';
import { AdminCreatePartnerInput, CreateStoreInput, PartnersService } from './partners.service';

const OffersQuery = z.object({
  status: z.enum(OFFER_STATUSES).optional(),
  kind: z.enum(OFFER_KINDS).optional(),
  display: z.enum(['draft', 'in_review', 'changes_requested', 'scheduled', 'active', 'paused', 'ended', 'rejected']).optional(),
});
const SearchQuery = z.object({ q: z.string().max(120).optional() });
const UpdateMemberInput = z.object({ role: z.enum(PARTNER_MEMBER_ROLES).optional(), title: z.string().max(120).nullable().optional() });
const InviteMemberInput = InvitePartnerMemberInput.extend({ title: z.string().max(120).optional() });
const PartnerProfileInput = UpdatePartnerInput.extend({ color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), subtitle: z.string().max(120).optional() });
const BrandReviewInput = z.object({ note: z.string().max(1000).optional() });
const LeadsQuery = z.object({ status: z.enum(PARTNER_LEAD_STATUSES).optional() });

/** Portail partenaires : tout est cloisonné par organisation (membre actif requis, enseigne → magasins). */
@Controller('v1/partner/:partnerId')
@Allow('partner', 'admin')
export class PartnerPortalController {
  constructor(
    private readonly partners: PartnersService,
    private readonly offers: OffersService,
    private readonly stats: PartnerStatsService,
    private readonly engine: OfferEngine,
    private readonly access: AccessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  detail(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string) {
    return this.partners.detail(p, id);
  }

  @Patch()
  update(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string, @Body(zod(PartnerProfileInput)) body: z.infer<typeof PartnerProfileInput>) {
    return this.partners.update(p, id, body);
  }

  @Get('dashboard')
  dashboard(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string, @Query(zod(RangeQuery)) q: { days: number }) {
    return this.stats.dashboard(p, id, q.days);
  }

  @Get('offers')
  list(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string, @Query(zod(OffersQuery)) q: z.infer<typeof OffersQuery>) {
    return this.offers.list(p, id, q);
  }

  @Post('offers')
  create(@CurrentPrincipal() p: UserPrincipal, @Param('partnerId', ParseUUIDPipe) id: string, @Body(zod(CreateOfferInput)) body: CreateOfferInput) {
    return this.offers.create(p, id, body);
  }

  @Get('store-offers')
  storeOffers(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string) {
    return this.offers.brandQueue(p, id);
  }

  @Post('stores')
  createStore(@CurrentPrincipal() p: UserPrincipal, @Param('partnerId', ParseUUIDPipe) id: string, @Body(zod(CreateStoreInput)) body: z.infer<typeof CreateStoreInput>) {
    return this.partners.createStore(p, id, body);
  }

  @Post('members')
  invite(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string, @Body(zod(InviteMemberInput)) body: z.infer<typeof InviteMemberInput>) {
    return this.partners.inviteMember(p, id, body);
  }

  @Patch('members/:memberId')
  updateMember(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(zod(UpdateMemberInput)) body: z.infer<typeof UpdateMemberInput>) {
    return this.partners.updateMember(p, id, memberId, body);
  }

  @Delete('members/:memberId')
  revoke(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.partners.revokeMember(p, id, memberId);
  }

  @Get('places')
  places(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string) {
    return this.stats.places(p, id);
  }

  @Post('places')
  createPlace(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string, @Body(zod(PlaceInput)) body: PlaceInput) {
    return this.partners.createPlace(p, id, body);
  }

  @Patch('places/:placeId')
  updatePlace(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string, @Param('placeId', ParseUUIDPipe) placeId: string, @Body(zod(UpdatePlaceInput)) body: z.infer<typeof UpdatePlaceInput>) {
    return this.partners.updatePlace(p, id, placeId, body);
  }

  @Get('audience')
  audience(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string) {
    return this.stats.audienceZones(p, id);
  }

  @Get('audience/estimate')
  estimate(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string, @Query(zod(AudienceQuery)) q: AudienceQuery) {
    return this.stats.estimate(p, id, {
      targetType: q.targetType,
      targetPlaceId: q.placeId,
      targetRadiusKm: q.radiusKm,
      targetPostalCodes: q.postalCodes?.split(',').map((c) => c.trim()).filter(Boolean),
      targetPromoCodeId: q.promoCodeId,
      minAge: q.minAge,
      maxAge: q.maxAge,
    });
  }

  @Get('access-codes')
  async accessCodes(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string) {
    await this.access.assertPartnerMember(p, id, 'viewer');
    return this.prisma.promoCode.findMany({ where: { sponsorPartnerId: id }, select: { id: true, code: true, description: true, redemptions: true, maxRedemptions: true, isActive: true } });
  }

  @Get('redemptions')
  redemptions(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string) {
    return this.stats.redemptions(p, id);
  }

  @Get('redemptions.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="echanges.csv"')
  csv(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) id: string) {
    return this.stats.redemptionsCsv(p, id);
  }

  @Post('redemptions/verify')
  @HttpCode(200)
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('partnerId', ParseUUIDPipe) id: string, @Body(zod(VerifyCodeInput)) body: VerifyCodeInput) {
    return this.partners.verifyCode(p, id, body, (claimId, meta) => this.engine.redeem(claimId, meta));
  }
}

@Controller('v1/partner-offers/:offerId')
@Allow('partner', 'admin')
export class PartnerOfferController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  get(@CurrentPrincipal() p: Principal, @Param('offerId', ParseUUIDPipe) id: string) {
    return this.offers.get(p, id);
  }

  @Patch()
  update(@CurrentPrincipal() p: Principal, @Param('offerId', ParseUUIDPipe) id: string, @Body(zod(UpdateOfferInput)) body: UpdateOfferInput) {
    return this.offers.update(p, id, body);
  }

  @Delete()
  remove(@CurrentPrincipal() p: Principal, @Param('offerId', ParseUUIDPipe) id: string) {
    return this.offers.remove(p, id);
  }

  @Post('submit')
  @HttpCode(200)
  submit(@CurrentPrincipal() p: Principal, @Param('offerId', ParseUUIDPipe) id: string) {
    return this.offers.submit(p, id);
  }

  @Post('pause')
  @HttpCode(200)
  pause(@CurrentPrincipal() p: Principal, @Param('offerId', ParseUUIDPipe) id: string) {
    return this.offers.pause(p, id, true);
  }

  @Post('resume')
  @HttpCode(200)
  resume(@CurrentPrincipal() p: Principal, @Param('offerId', ParseUUIDPipe) id: string) {
    return this.offers.pause(p, id, false);
  }

  @Post('codes')
  @HttpCode(200)
  codes(@CurrentPrincipal() p: Principal, @Param('offerId', ParseUUIDPipe) id: string, @Body(zod(ImportCodesInput)) body: { codes: string[] }) {
    return this.offers.importCodes(p, id, body.codes);
  }

  @Get('stats')
  stats(@CurrentPrincipal() p: Principal, @Param('offerId', ParseUUIDPipe) id: string) {
    return this.offers.stats(p, id);
  }

  @Post('brand-approve')
  @HttpCode(200)
  brandApprove(@CurrentPrincipal() p: UserPrincipal, @Param('offerId', ParseUUIDPipe) id: string) {
    return this.offers.brandReview(p, id, { approve: true });
  }

  @Post('brand-request-changes')
  @HttpCode(200)
  brandChanges(@CurrentPrincipal() p: UserPrincipal, @Param('offerId', ParseUUIDPipe) id: string, @Body(zod(BrandReviewInput)) body: { note?: string }) {
    return this.offers.brandReview(p, id, { approve: false, note: body.note });
  }
}

/** Comptes accessibles (sélecteur « Changer de compte » du portail). */
@Controller('v1/partner-accounts')
@Allow('partner', 'admin')
export class PartnerAccountsController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  accounts(@CurrentPrincipal() p: UserPrincipal) {
    return this.partners.accounts(p);
  }
}

@Controller('v1/admin')
@Allow('admin')
export class AdminPartnersController {
  constructor(
    private readonly partners: PartnersService,
    private readonly offers: OffersService,
    private readonly moderation: ModerationService,
    private readonly leads: PartnerLeadsService,
  ) {}

  @Get('partner-leads')
  leadList(@Query(zod(LeadsQuery)) q: z.infer<typeof LeadsQuery>) {
    return this.leads.list(q.status);
  }

  @Patch('partner-leads/:id')
  leadStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(UpdatePartnerLeadInput)) body: z.infer<typeof UpdatePartnerLeadInput>) {
    return this.leads.setStatus(p, id, body.status);
  }

  @Get('partners')
  list(@Query(zod(SearchQuery)) q: z.infer<typeof SearchQuery>) {
    return this.partners.list(q.q);
  }

  @Post('partners')
  create(@CurrentPrincipal() p: UserPrincipal, @Body(zod(AdminCreatePartnerInput)) body: AdminCreatePartnerInput) {
    return this.partners.create(p, body);
  }

  @Patch('partners/:id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body(zod(SetPartnerStatusInput)) body: z.infer<typeof SetPartnerStatusInput>) {
    return this.partners.setStatus(id, body.status, (tx, offerId, visible) => this.offers.setVisibility(tx, offerId, visible));
  }

  @Get('moderation/offers')
  queue() {
    return this.moderation.queue();
  }

  @Post('moderation/offers/:id/approve')
  @HttpCode(200)
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.moderation.approve(p, id);
  }

  @Post('moderation/offers/:id/reject')
  @HttpCode(200)
  reject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(RejectOfferInput)) body: { reason: string }) {
    return this.moderation.reject(p, id, body.reason);
  }

  @Post('moderation/offers/:id/request-changes')
  @HttpCode(200)
  requestChanges(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(RequestChangesInput)) body: { note: string }) {
    return this.moderation.requestChanges(p, id, body.note);
  }
}

/** Landing partenaires : formulaire « Être rappelé » (public). */
@Controller('v1/partner-leads')
export class PartnerLeadsController {
  constructor(private readonly leads: PartnerLeadsService) {}

  @Public()
  @Post()
  @HttpCode(202)
  submit(@Body(zod(PartnerLeadInput)) body: PartnerLeadInput) {
    return this.leads.submit(body);
  }
}

/** Côté famille (app mobile) : bons débloqués, progression, vues d'offres. */
@Controller('v1')
export class FamilyOffersController {
  constructor(private readonly engine: OfferEngine) {}

  @Get('offer-claims')
  @Allow('parent')
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.engine.claims(p);
  }

  @Post('offer-claims/:id/redeem')
  @Allow('parent')
  @HttpCode(200)
  redeem(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.engine.markRedeemed(p, id);
  }

  @Get('offer-progress')
  @Allow('parent')
  progress(@CurrentPrincipal() p: UserPrincipal) {
    return this.engine.progress(p);
  }

  @Post('offers/:id/impression')
  @Allow('parent', 'child')
  @HttpCode(200)
  impression(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.engine.recordImpression(p, id);
  }
}

@Module({
  imports: [EntitlementsModule],
  controllers: [PartnerPortalController, PartnerOfferController, PartnerAccountsController, AdminPartnersController, PartnerLeadsController, FamilyOffersController],
  providers: [PartnersService, PartnerLeadsService, OffersService, AudienceService, PartnerStatsService, ModerationService, OfferEngine, { provide: PARTNER_REWARDS, useExisting: OfferEngine }],
  exports: [PARTNER_REWARDS, PartnersService, OffersService, OfferEngine, ModerationService, AudienceService],
})
export class PartnersModule {}
