import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  AcceptFamilyInvitationInput,
  CreateChildInput,
  CreateFamilyInvitationInput,
  UpdateChildInput,
  UpdateProfileInput,
} from '@rekonect/contracts';
import { Allow, CurrentPrincipal, type UserPrincipal } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';
import { EntitlementsModule } from '../billing/billing.module';
import { IdentityModule } from '../identity/identity.module';
import { FamiliesService } from './families.service';

@Controller('v1')
@Allow('parent')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  @Get('profile')
  profile(@CurrentPrincipal() p: UserPrincipal) {
    return this.families.profile(p);
  }

  @Patch('profile')
  updateProfile(@CurrentPrincipal() p: UserPrincipal, @Body(zod(UpdateProfileInput)) body: UpdateProfileInput) {
    return this.families.updateProfile(p, body);
  }

  @Get('children')
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.families.listChildren(p);
  }

  @Post('children')
  create(@CurrentPrincipal() p: UserPrincipal, @Body(zod(CreateChildInput)) body: CreateChildInput) {
    return this.families.createChild(p, body);
  }

  @Get('children/:id')
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.families.getChild(p, id);
  }

  @Patch('children/:id')
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(zod(UpdateChildInput)) body: UpdateChildInput) {
    return this.families.updateChild(p, id, body);
  }

  @Delete('children/:id')
  archive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.families.archiveChild(p, id);
  }

  @Post('children/:id/link-code')
  linkCode(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.families.createLinkCode(p, id);
  }

  @Delete('children/:id/sessions')
  revokeSessions(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.families.revokeChildSessions(p, id);
  }

  @Get('family/members')
  members(@CurrentPrincipal() p: UserPrincipal) {
    return this.families.members(p);
  }

  @Post('family/invitations')
  invite(@CurrentPrincipal() p: UserPrincipal, @Body(zod(CreateFamilyInvitationInput)) body: CreateFamilyInvitationInput) {
    return this.families.createInvitation(p, body);
  }

  @Post('family/invitations/accept')
  @HttpCode(200)
  accept(@CurrentPrincipal() p: UserPrincipal, @Body(zod(AcceptFamilyInvitationInput)) body: { token: string }) {
    return this.families.acceptInvitation(p, body.token);
  }

  @Delete('family/members/:id')
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.families.revokeMember(p, id);
  }
}

@Module({
  imports: [IdentityModule, EntitlementsModule],
  controllers: [FamiliesController],
  providers: [FamiliesService],
  exports: [FamiliesService],
})
export class FamiliesModule {}
