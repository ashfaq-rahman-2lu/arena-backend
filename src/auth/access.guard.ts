import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApplicationError } from "../common/application-error";
import { ConfigurationService } from "../config/configuration.service";
import { equal } from "./crypto";
import { AuthedRequest, cookie } from "./http-session";
import { SessionsService } from "./sessions.service";
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionsService,
    private readonly reflector: Reflector,
    private readonly config: ConfigurationService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const session = await this.sessions.find(cookie(request, "arena_session"));
    if (session) {
      request.userId = session.userId;
      request.sessionId = session.id;
      request.csrf = session.csrf;
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const csrf = request.headers["x-csrf-token"],
        csrfCookie = cookie(request, "arena_csrf");
      if (
        request.headers.origin &&
        request.headers.origin !== this.config.values.frontendUrl
      )
        throw new ApplicationError(
          "CSRF_INVALID",
          403,
          "Invalid request origin",
        );
      if (
        typeof csrf !== "string" ||
        !/^([a-f0-9]{48})$/.test(csrf) ||
        !csrfCookie ||
        !equal(csrf, csrfCookie) ||
        (session && !equal(csrf, session.csrf))
      )
        throw new ApplicationError(
          "CSRF_INVALID",
          403,
          "Refresh the page and try again (CSRF token missing)",
        );
    }
    if (
      !this.reflector.getAllAndOverride<boolean>("public", [
        context.getHandler(),
        context.getClass(),
      ]) &&
      !session
    )
      throw new ApplicationError("UNAUTHENTICATED", 401, "Sign in to continue");
    return true;
  }
}
