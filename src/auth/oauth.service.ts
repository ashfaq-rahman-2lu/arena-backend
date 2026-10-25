import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { ApplicationError } from "../common/application-error";
import {
  OAuthAttemptAction,
  OAuthAttemptRecord,
  OAuthCompletion,
  OAuthStart,
} from "./auth.models";
import { AuthRepository } from "./auth.repository";
import { equal, hash } from "./crypto";
import { OAuthPort } from "./google-oauth.adapter";

export function safeOAuthReturnTo(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  )
    return "/dashboard";
  try {
    const url = new URL(value, "https://arena.invalid");
    return url.origin === "https://arena.invalid"
      ? url.pathname + url.search + url.hash
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

function failedCompletion(attempt: OAuthAttemptRecord): OAuthCompletion {
  return {
    action: attempt.action,
    userId: null,
    emailChange: null,
    linked: false,
    returnTo: attempt.returnTo,
    cancelled: false,
    failed: true,
  };
}

@Injectable()
export class OAuthService {
  constructor(
    @Inject(OAuthPort) private readonly provider: OAuthPort,
    private readonly repository: AuthRepository,
  ) {}

  async begin(
    action: OAuthAttemptAction,
    userId: string | null,
    sessionId: string | null,
    proposedEmail: string | null,
    returnTo: string | null,
  ): Promise<OAuthStart> {
    if (action !== "LOGIN" && (!userId || !sessionId))
      throw new ApplicationError(
        "UNAUTHENTICATED",
        401,
        "Sign in before changing account sign-in methods",
      );
    const state = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 600000);
    await this.repository.createOAuthAttempt(
      hash(state),
      action,
      action === "LOGIN" ? null : userId,
      action === "LOGIN" ? null : sessionId,
      action === "EMAIL_CHANGE" ? proposedEmail : null,
      safeOAuthReturnTo(returnTo),
      expiresAt,
    );
    return { state, url: this.provider.authorize(state) };
  }

  async complete(
    rawState: string | null,
    state: string,
    code: string | null,
    providerError: string | null,
    currentUserId: string | null,
    currentSessionId: string | null,
  ): Promise<OAuthCompletion> {
    if (!rawState || !equal(rawState, state))
      throw new ApplicationError("OAUTH_INVALID", 400, "Invalid Google state");
    const attempt = await this.repository.consumeOAuthAttempt(hash(state));
    if (
      attempt.action !== "LOGIN" &&
      (attempt.userId !== currentUserId ||
        attempt.sessionId !== currentSessionId)
    )
      return failedCompletion(attempt);
    if (providerError || !code)
      return {
        action: attempt.action,
        userId: null,
        emailChange: null,
        linked: false,
        returnTo: attempt.returnTo,
        cancelled: true,
        failed: false,
      };
    try {
      const identity = await this.provider.identity(code);
      if (attempt.action === "EMAIL_CHANGE") {
        if (!attempt.userId || !attempt.sessionId || !attempt.proposedEmail)
          throw new ApplicationError(
            "OAUTH_INVALID",
            400,
            "Google confirmation is invalid",
          );
        await this.repository.verifyGoogleIdentity(
          attempt.userId,
          identity.subject,
          attempt.sessionId,
        );
        return {
          action: attempt.action,
          userId: attempt.userId,
          emailChange: attempt.proposedEmail,
          linked: false,
          returnTo: attempt.returnTo,
          cancelled: false,
          failed: false,
        };
      }
      const userId = await this.repository.resolveGoogle(
        identity,
        attempt.action === "LINK" ? attempt.userId : null,
        attempt.action === "LINK" ? attempt.sessionId : null,
      );
      return {
        action: attempt.action,
        userId,
        emailChange: null,
        linked: attempt.action === "LINK",
        returnTo: attempt.returnTo,
        cancelled: false,
        failed: false,
      };
    } catch (error: unknown) {
      if (error instanceof ApplicationError) return failedCompletion(attempt);
      throw error;
    }
  }
}
