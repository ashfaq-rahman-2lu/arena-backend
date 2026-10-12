import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ApplicationError } from "../common/application-error";
import { OAuthStart } from "./auth.models";
import { AuthRepository } from "./auth.repository";
import { equal } from "./crypto";
import { OAuthPort } from "./google-oauth.adapter";
const stateSchema = z
  .object({
    state: z.string().regex(/^[a-f0-9]{64}$/),
    userId: z.uuid().nullable(),
    expires: z.number().int().positive(),
  })
  .strict();
@Injectable()
export class OAuthService {
  constructor(
    @Inject(OAuthPort) private readonly provider: OAuthPort,
    private readonly repository: AuthRepository,
  ) {}
  begin(link: boolean, userId: string | null): OAuthStart {
    if (link && !userId)
      throw new ApplicationError(
        "UNAUTHENTICATED",
        401,
        "Sign in before linking Google",
      );
    const state = {
      state: randomBytes(32).toString("hex"),
      userId: link ? userId : null,
      expires: Date.now() + 600000,
    };
    return { state, url: this.provider.authorize(state.state) };
  }
  async complete(
    rawState: string | null,
    state: string,
    code: string,
    currentUserId: string | null,
  ): Promise<string> {
    let data: unknown;
    try {
      data = JSON.parse(rawState ?? "null");
    } catch {
      throw new ApplicationError("OAUTH_INVALID", 400, "Invalid Google state");
    }
    const parsed = stateSchema.safeParse(data);
    if (
      !parsed.success ||
      !equal(parsed.data.state, state) ||
      parsed.data.expires < Date.now()
    )
      throw new ApplicationError(
        "OAUTH_INVALID",
        400,
        "Google sign-in expired or was cancelled",
      );
    if (parsed.data.userId && parsed.data.userId !== currentUserId)
      throw new ApplicationError(
        "UNAUTHENTICATED",
        401,
        "Sign in again before linking",
      );
    const identity = await this.provider.identity(code);
    return this.repository.resolveGoogle(identity, parsed.data.userId);
  }
}
