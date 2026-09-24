import { Body, Controller, Get, Headers, HttpCode, Module, Post } from '@nestjs/common';
import {
  AcceptPartnerInvitationInput,
  ChangeEmailInput,
  ChangePasswordInput,
  ChildLinkInput,
  ChildPinLoginInput,
  ForgotPasswordInput,
  LoginInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
} from '@rekonect/contracts';
import { z } from 'zod';
import { Allow, CurrentPrincipal, type Principal, Public, type UserPrincipal } from '../../platform/auth/principal';
import { zod } from '../../platform/http/zod.pipe';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

const LogoutInput = z.object({ refreshToken: z.string().optional(), pushToken: z.string().optional() });

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body(zod(RegisterInput)) body: RegisterInput, @Headers('user-agent') ua?: string) {
    return this.auth.register(body, { userAgent: ua });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(zod(LoginInput)) body: LoginInput, @Headers('user-agent') ua?: string) {
    return this.auth.login(body, { userAgent: ua });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(zod(RefreshInput)) body: RefreshInput, @Headers('user-agent') ua?: string) {
    return this.auth.refresh(body.refreshToken, { userAgent: ua });
  }

  @Post('logout')
  @HttpCode(200)
  logout(@CurrentPrincipal() p: Principal, @Body(zod(LogoutInput)) body: z.infer<typeof LogoutInput>) {
    return this.auth.logout(body.refreshToken, p, body.pushToken);
  }

  @Get('me')
  me(@CurrentPrincipal() p: Principal) {
    return this.auth.me(p);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(200)
  forgot(@Body(zod(ForgotPasswordInput)) body: { email: string }) {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(200)
  reset(@Body(zod(ResetPasswordInput)) body: ResetPasswordInput) {
    return this.auth.resetPassword(body);
  }

  @Post('password/change')
  @Allow('parent', 'admin', 'partner')
  @HttpCode(200)
  changePassword(@CurrentPrincipal() p: UserPrincipal, @Body(zod(ChangePasswordInput)) body: ChangePasswordInput, @Headers('user-agent') ua?: string) {
    return this.auth.changePassword(p, body, { userAgent: ua });
  }

  @Post('email')
  @Allow('parent', 'admin', 'partner')
  @HttpCode(200)
  changeEmail(@CurrentPrincipal() p: UserPrincipal, @Body(zod(ChangeEmailInput)) body: ChangeEmailInput) {
    return this.auth.changeEmail(p, body);
  }

  @Public()
  @Post('child/link')
  @HttpCode(200)
  childLink(@Body(zod(ChildLinkInput)) body: ChildLinkInput, @Headers('user-agent') ua?: string) {
    return this.auth.claimChildLink(body, { userAgent: ua });
  }

  @Public()
  @Post('child/login')
  @HttpCode(200)
  childLogin(@Body(zod(ChildPinLoginInput)) body: ChildPinLoginInput, @Headers('user-agent') ua?: string) {
    return this.auth.childPinLogin(body, { userAgent: ua });
  }

  @Public()
  @Post('partner-invitations/accept')
  @HttpCode(200)
  acceptPartner(@Body(zod(AcceptPartnerInvitationInput)) body: AcceptPartnerInvitationInput, @Headers('user-agent') ua?: string) {
    return this.auth.acceptPartnerInvitation(body, { userAgent: ua });
  }
}

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
  ],
  exports: [TokenService, AuthService],
})
export class IdentityModule {}
