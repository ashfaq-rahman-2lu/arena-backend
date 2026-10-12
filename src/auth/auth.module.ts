import { Module } from "@nestjs/common";
import { AccessGuard } from "./access.guard";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { GoogleOAuthAdapter, OAuthPort } from "./google-oauth.adapter";
import { OAuthService } from "./oauth.service";
import { RateGuard } from "./rate.guard";
import { SessionsService } from "./sessions.service";
import { EmailPort, SmtpEmailAdapter } from "./smtp-email.adapter";
import { TokensService } from "./tokens.service";
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    SessionsService,
    TokensService,
    OAuthService,
    AccessGuard,
    RateGuard,
    { provide: EmailPort, useClass: SmtpEmailAdapter },
    { provide: OAuthPort, useClass: GoogleOAuthAdapter },
  ],
  exports: [AccessGuard, RateGuard],
})
export class AuthModule {}
