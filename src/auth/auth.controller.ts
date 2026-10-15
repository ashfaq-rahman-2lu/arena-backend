import { Body, Controller, Get, Post, Query, Req, Res } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { ConfigurationService } from "../config/configuration.service";
import {
  EmailInput,
  GoogleCallbackQuery,
  GoogleStartQuery,
  LoginInput,
  RegistrationInput,
  ResetInput,
  TokenInput,
} from "./auth-request.dto";
import {
  MessageResult,
  SessionCredentialsView,
  SessionView,
} from "./auth-response.dto";
import { AuthService } from "./auth.service";
import { Public, cookie, cookieOptions, setCredentials } from "./http-session";
import { OAuthService } from "./oauth.service";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";
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
    const start = this.oauth.begin(query.link === "1", session?.userId ?? null);
    response.cookie("arena_oauth", JSON.stringify(start.state), {
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
    const userId = await this.oauth.complete(
      state,
      query.state,
      query.code,
      session?.userId ?? null,
    );
    setCredentials(response, await this.sessions.create(userId), this.config);
    response.redirect(`${this.config.values.frontendUrl}/dashboard`);
  }
}
