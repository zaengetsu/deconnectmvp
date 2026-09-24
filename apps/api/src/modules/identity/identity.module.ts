import { Body, Controller, Get, Headers, HttpCode, Injectable, Module, OnModuleInit, Post } from '@nestjs/common';
import {
  AcceptPartnerInvitationInput,
  ChildLinkInput,
  ChildPinLoginInput,
  ForgotPasswordInput,
  LoginInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
} from '@rekonect/contracts';
import { z } from 'zod';
import { CurrentPrincipal, type Principal, Public } from '../../platform/auth/principal';
import { EventRegistry } from '../../platform/events/event-registry';
import { zod } from '../../platform/http/zod.pipe';
import { Mailer } from '../../platform/mail/mailer';
import { mails } from '../../platform/mail/templates';
import { PrismaService } from '../../platform/prisma/prisma.service';
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

/** Email de bienvenue envoyé de façon asynchrone (retenté par l'outbox en cas d'échec fournisseur). */
@Injectable()
export class IdentityConsumers implements OnModuleInit {
  constructor(
    private readonly registry: EventRegistry,
    private readonly mailer: Mailer,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.registry.on('user.registered', 'identity.welcome-email', async (event) => {
      if (event.payload.role !== 'parent') return;
      const user = await this.prisma.user.findUnique({ where: { id: event.payload.userId } });
      if (!user) return;
      const res = await this.mailer.send(mails.welcome(user.email, user.fullName));
      if (res.status === 'failed' && res.retryable) throw new Error(res.error);
    });
  }
}

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    IdentityConsumers,
  ],
  exports: [TokenService, AuthService],
})
export class IdentityModule {}
