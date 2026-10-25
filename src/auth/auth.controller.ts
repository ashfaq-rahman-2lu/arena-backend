import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { ConfigurationService } from "../config/configuration.service";
import { ApplicationError } from "../common/application-error";
import {
  EmailInput,
  GoogleCallbackQuery,
  GoogleStartQuery,
  LoginInput,
  RegistrationInput,
  ResetInput,
  TokenInput,
  ProfileUpdateInput,
  PasswordChangeInput,
  EmailChangeInput,
} from "./auth-request.dto";
import {
  MessageResult,
  SessionCredentialsView,
  SessionView,
} from "./auth-response.dto";
import { AuthService } from "./auth.service";
import {
  actor,
  AuthedRequest,
  Public,
  cookie,
  cookieOptions,
  setCredentials,
} from "./http-session";
import { OAuthService } from "./oauth.service";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";
import { EmailChangeResult } from "./auth.models";
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
    private readonly oauth: OAuthService,
    private readonly config: ConfigurationService,
  ) {}
  @Public()
  @Get("session")
  @ApiOkResponse({ type: SessionView })
  async session(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionView> {
    response.setHeader("Cache-Control", "no-store");
    const result = await this.sessions.view(
      cookie(request, "arena_session"),
      cookie(request, "arena_csrf"),
    );
    response.cookie("arena_csrf", result.csrf, {
      ...cookieOptions(this.config),
      maxAge: 7 * 86400000,
    });
    return result;
  }
  @Public()
  @Post("register")
  @ApiSecurity("csrf")
  @ApiCreatedResponse({ type: MessageResult })
  register(@Body() input: RegistrationInput): Promise<MessageResult> {
    return this.auth.register(input);
  }
  @Public()
  @Post("login")
  @ApiSecurity("csrf")
  @ApiCreatedResponse({ type: SessionCredentialsView })
  async login(
    @Body() input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionCredentialsView> {
    const credentials = await this.sessions.create(
      await this.auth.login(input),
    );
    setCredentials(response, credentials, this.config);
    return { csrf: credentials.csrf };
  }
  @Public()
  @Post("verify")
  @ApiSecurity("csrf")
  @ApiCreatedResponse({ type: MessageResult })
  verify(@Body() input: TokenInput): Promise<MessageResult> {
    return this.tokens.verify(input.token);
  }
  @Public()
  @Post("resend-verification")
  @ApiSecurity("csrf")
  @ApiCreatedResponse({ type: MessageResult })
  resend(@Body() input: EmailInput): Promise<MessageResult> {
    return this.tokens.send(input.email, "VERIFY");
  }
  @Public()
  @Post("forgot-password")
  @ApiSecurity("csrf")
  @ApiCreatedResponse({ type: MessageResult })
  forgot(@Body() input: EmailInput): Promise<MessageResult> {
    return this.tokens.send(input.email, "RESET");
  }
  @Public()
  @Post("reset-password")
  @ApiSecurity("csrf")
  @ApiCreatedResponse({ type: MessageResult })
  reset(@Body() input: ResetInput): Promise<MessageResult> {
    return this.tokens.reset(input.token, input.password);
  }
  @Patch("profile")
  @ApiSecurity({ cookie: [], csrf: [] })
  @ApiOkResponse({ type: MessageResult })
  @ApiUnauthorizedResponse({ description: "Session expired" })
  @ApiForbiddenResponse({ description: "CSRF validation failed" })
  updateProfile(
    @Req() request: AuthedRequest,
    @Body() input: ProfileUpdateInput,
  ): Promise<MessageResult> {
    return this.auth.updateName(actor(request), input.name);
  }
  @Post("password/setup")
  @ApiSecurity({ cookie: [], csrf: [] })
  @ApiCreatedResponse({ type: MessageResult })
  @ApiUnauthorizedResponse({ description: "Session expired" })
  @ApiForbiddenResponse({ description: "CSRF validation failed" })
  async setupPassword(@Req() request: AuthedRequest): Promise<MessageResult> {
    const user = await this.auth.account(actor(request));
    if (!user)
      throw new ApplicationError("UNAUTHENTICATED", 401, "Sign in to continue");
    if (user.passwordHash) return { message: "A password is already set." };
    await this.tokens.deliver(user.id, user.email, "RESET");
    return { message: "Password setup link sent to your account email." };
  }
  @Post("password/change")
  @ApiSecurity({ cookie: [], csrf: [] })
  @ApiCreatedResponse({ type: MessageResult })
  @ApiUnauthorizedResponse({
    description: "Session expired or password invalid",
  })
  @ApiForbiddenResponse({ description: "CSRF validation failed" })
  changePassword(
    @Req() request: AuthedRequest,
    @Body() input: PasswordChangeInput,
  ): Promise<MessageResult> {
    return this.auth.changePassword(
      actor(request),
      input.currentPassword,
      input.password,
    );
  }
  @Post("email-change")
  @ApiSecurity({ cookie: [], csrf: [] })
  @ApiCreatedResponse({
    schema: {
      oneOf: [
        {
          type: "object",
          required: ["status", "message"],
          properties: {
            status: { type: "string", enum: ["verification_sent"] },
            message: { type: "string" },
          },
        },
        {
          type: "object",
          required: ["status", "authorizationUrl"],
          properties: {
            status: {
              type: "string",
              enum: ["google_confirmation_required"],
            },
            authorizationUrl: { type: "string", format: "uri" },
          },
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: "Session expired or password invalid",
  })
  @ApiForbiddenResponse({ description: "CSRF validation failed" })
  @ApiBadRequestResponse({ description: "Invalid email-change request" })
  async requestEmailChange(
    @Req() request: AuthedRequest,
    @Body() input: EmailChangeInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmailChangeResult> {
    const userId = actor(request);
    const decision = await this.tokens.requestEmailChange(
      userId,
      input.email,
      input.currentPassword,
    );
    if (decision.status === "verification_sent") return decision;
    const start = await this.oauth.begin(
      "EMAIL_CHANGE",
      userId,
      request.sessionId ?? null,
      input.email,
      null,
    );
    response.cookie("arena_oauth", start.state, {
      ...cookieOptions(this.config),
      maxAge: 600000,
    });
    return {
      status: "google_confirmation_required",
      authorizationUrl: start.url,
    };
  }
  @Public()
  @Post("email-change/confirm")
  @ApiSecurity("csrf")
  @ApiCreatedResponse({ type: MessageResult })
  confirmEmailChange(@Body() input: TokenInput): Promise<MessageResult> {
    return this.tokens.confirmEmail(input.token);
  }
  @Post("logout")
  @ApiSecurity("csrf")
  @ApiCreatedResponse({ type: MessageResult })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MessageResult> {
    await this.sessions.revoke(cookie(request, "arena_session"));
    response.clearCookie("arena_session", cookieOptions(this.config));
    response.clearCookie("arena_csrf", cookieOptions(this.config));
    return { message: "Signed out" };
  }
  @Public()
  @Get("google")
  @ApiFoundResponse({ description: "Redirect to Google" })
  async google(
    @Query() query: GoogleStartQuery,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const session = await this.sessions.find(cookie(request, "arena_session"));
    const action = query.link === "1" ? "LINK" : "LOGIN";
    const start = await this.oauth.begin(
      action,
      session?.userId ?? null,
      session?.id ?? null,
      null,
      query.returnTo ?? null,
    );
    response.cookie("arena_oauth", start.state, {
      ...cookieOptions(this.config),
      maxAge: 600000,
    });
    response.redirect(start.url);
  }
  @Public()
  @Get("google/callback")
  @ApiFoundResponse({ description: "Redirect to dashboard" })
  async callback(
    @Query() query: GoogleCallbackQuery,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const state = cookie(request, "arena_oauth");
    response.clearCookie("arena_oauth", cookieOptions(this.config));
    const session = await this.sessions.find(cookie(request, "arena_session"));
    try {
      const completion = await this.oauth.complete(
        state,
        query.state,
        query.code ?? null,
        query.error ?? null,
        session?.userId ?? null,
        session?.id ?? null,
      );
      if (completion.failed) {
        response.redirect(
          completion.action === "LOGIN"
            ? `${this.config.values.frontendUrl}/auth/login?error=google_failed&returnTo=${encodeURIComponent(completion.returnTo)}`
            : `${this.config.values.frontendUrl}/dashboard?settings=1&google=failed`,
        );
        return;
      }
      if (completion.cancelled) {
        response.redirect(
          completion.action === "LOGIN"
            ? `${this.config.values.frontendUrl}/auth/login?error=google_cancelled&returnTo=${encodeURIComponent(completion.returnTo)}`
            : `${this.config.values.frontendUrl}/dashboard?settings=1&google=cancelled`,
        );
        return;
      }
      if (completion.action === "LOGIN" && completion.userId) {
        setCredentials(
          response,
          await this.sessions.create(completion.userId),
          this.config,
        );
        response.redirect(
          `${this.config.values.frontendUrl}${completion.returnTo}`,
        );
        return;
      }
      if (
        completion.action === "EMAIL_CHANGE" &&
        completion.userId &&
        completion.emailChange
      )
        await this.tokens.requestEmailChange(
          completion.userId,
          completion.emailChange,
          undefined,
          true,
        );
      response.redirect(
        `${this.config.values.frontendUrl}/dashboard?settings=1&google=${completion.action === "LINK" ? "linked" : "email_confirmation_sent"}`,
      );
    } catch (_error: unknown) {
      response.redirect(
        session
          ? `${this.config.values.frontendUrl}/dashboard?settings=1&google=failed`
          : `${this.config.values.frontendUrl}/auth/login?error=google_failed`,
      );
    }
  }
}
