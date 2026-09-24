import { Body, Controller, Get, Headers, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { CheckoutInput, CreatePromoCodeInput, GiftMonthsInput, RedeemPromoInput, UpdatePlanInput } from '@rekonect/contracts';
import type { Request } from 'express';
import { z } from 'zod';
import { Allow, CurrentPrincipal, type Principal, Public, type UserPrincipal } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';
import { BillingAdminService } from './billing-admin.service';
import { BillingService } from './billing.service';
import { EntitlementsService } from './entitlements.service';
import { BillingGateway } from './gateway';
import { StripeGateway } from './stripe.gateway';
import { BillingWebhookService } from './webhook.service';

const AudienceQuery = z.object({ audience: z.enum(['family', 'partner']).default('family') });
const CancelInput = z.object({ reason: z.string().max(200).optional() });
const ActiveInput = z.object({ isActive: z.boolean() });

/** Abonnement de la famille (app mobile). */
@Controller('v1/billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly webhooks: BillingWebhookService,
  ) {}

  @Get('plans')
  plans(@Query(zod(AudienceQuery)) q: z.infer<typeof AudienceQuery>) {
    return this.billing.plans(q.audience);
  }

  @Get('subscription')
  @Allow('parent')
  async subscription(@CurrentPrincipal() p: Principal) {
    return this.billing.summary(await this.billing.ownerFor(p));
  }

  @Get('invoices')
  @Allow('parent')
  async invoices(@CurrentPrincipal() p: Principal) {
    return this.billing.invoices(await this.billing.ownerFor(p));
  }

  @Post('checkout')
  @Allow('parent')
  @HttpCode(200)
  async checkout(@CurrentPrincipal() p: Principal, @Body(zod(CheckoutInput)) body: CheckoutInput) {
    return this.billing.checkout(await this.billing.ownerFor(p), body);
  }

  @Post('change-plan')
  @Allow('parent')
  @HttpCode(200)
  async change(@CurrentPrincipal() p: Principal, @Body(zod(CheckoutInput)) body: CheckoutInput) {
    return this.billing.changePlan(await this.billing.ownerFor(p), body);
  }

  @Post('portal')
  @Allow('parent')
  @HttpCode(200)
  async portal(@CurrentPrincipal() p: Principal) {
    return this.billing.portal(await this.billing.ownerFor(p));
  }

  @Post('cancel')
  @Allow('parent')
  @HttpCode(200)
  async cancel(@CurrentPrincipal() p: Principal, @Body(zod(CancelInput)) body: z.infer<typeof CancelInput>) {
    return this.billing.cancel(await this.billing.ownerFor(p), body.reason);
  }

  @Post('resume')
  @Allow('parent')
  @HttpCode(200)
  async resume(@CurrentPrincipal() p: Principal) {
    return this.billing.resume(await this.billing.ownerFor(p));
  }

  @Post('redeem')
  @Allow('parent')
  @HttpCode(200)
  redeem(@CurrentPrincipal() p: UserPrincipal, @Body(zod(RedeemPromoInput)) body: { code: string }) {
    return this.billing.redeem(p, body.code);
  }

  /** Webhook Stripe : signature vérifiée sur le corps brut. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.webhooks.handle(req.rawBody, signature);
  }
}

/** Abonnement d'un partenaire (portail partenaires, responsable uniquement). */
@Controller('v1/partner/:partnerId/billing')
@Allow('partner', 'admin')
export class PartnerBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  async summary(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) partnerId: string) {
    const owner = await this.billing.ownerFor(p, partnerId);
    const [summary, invoices] = await Promise.all([this.billing.summary(owner), this.billing.invoices(owner)]);
    return { ...summary, invoices };
  }

  @Post('checkout')
  @HttpCode(200)
  async checkout(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) partnerId: string, @Body(zod(CheckoutInput)) body: CheckoutInput) {
    return this.billing.changePlan(await this.billing.ownerFor(p, partnerId), body);
  }

  @Post('portal')
  @HttpCode(200)
  async portal(@CurrentPrincipal() p: Principal, @Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.billing.portal(await this.billing.ownerFor(p, partnerId));
  }
}

@Controller('v1/admin')
@Allow('admin')
export class AdminBillingController {
  constructor(private readonly admin: BillingAdminService) {}

  @Get('billing/overview')
  overview() {
    return this.admin.overview();
  }

  @Get('billing/events')
  events() {
    return this.admin.events(30);
  }

  @Get('plans')
  plans(@Query(zod(AudienceQuery)) q: z.infer<typeof AudienceQuery>) {
    return this.admin.plans(q.audience);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body(zod(UpdatePlanInput)) body: UpdatePlanInput) {
    return this.admin.updatePlan(id, body);
  }

  @Get('promo-codes')
  promoCodes() {
    return this.admin.promoCodes();
  }

  @Post('promo-codes')
  createPromo(@Body(zod(CreatePromoCodeInput)) body: CreatePromoCodeInput) {
    return this.admin.createPromoCode(body);
  }

  @Patch('promo-codes/:id')
  setPromo(@Param('id', ParseUUIDPipe) id: string, @Body(zod(ActiveInput)) body: { isActive: boolean }) {
    return this.admin.setPromoActive(id, body.isActive);
  }

  @Post('families/:id/gift')
  @HttpCode(200)
  gift(@Param('id', ParseUUIDPipe) id: string, @Body(zod(GiftMonthsInput)) body: z.infer<typeof GiftMonthsInput>) {
    return this.admin.giftMonths(id, body.months, body.planId);
  }

  @Get('families/:id/payments')
  payments(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.payments(id);
  }
}

/** Droits d'usage : exportés pour que les autres modules appliquent les limites du plan. */
@Module({
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}

@Module({
  imports: [EntitlementsModule],
  controllers: [BillingController, PartnerBillingController, AdminBillingController],
  providers: [BillingService, BillingWebhookService, BillingAdminService, { provide: BillingGateway, useClass: StripeGateway }],
  exports: [BillingService, BillingAdminService],
})
export class BillingModule {}
