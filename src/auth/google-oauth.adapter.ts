import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { ApplicationError } from "../common/application-error";
import { HttpTransport } from "../common/fetch-http.adapter";
import { ConfigurationService } from "../config/configuration.service";
import { GoogleIdentity } from "./auth.models";
export abstract class OAuthPort {
  abstract authorize(state: string): string;
  abstract identity(code: string): Promise<GoogleIdentity>;
}
const tokenSchema = z.object({ access_token: z.string().min(1) });
const identitySchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.email().max(254),
  email_verified: z.literal(true),
  name: z.string().min(1).max(255).optional(),
});
@Injectable()
export class GoogleOAuthAdapter extends OAuthPort {
  constructor(
    private readonly config: ConfigurationService,
    @Inject(HttpTransport) private readonly transport: HttpTransport,
  ) {
    super();
  }
  authorize(state: string): string {
    const google = this.config.values.google;
    if (!google)
      throw new ApplicationError(
        "INTEGRATION_UNAVAILABLE",
        503,
        "Google sign-in is not configured",
      );
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: google.clientId, redirect_uri: google.callbackUrl, response_type: "code", scope: "openid email profile", state, prompt: "select_account" })}`;
  }
  async identity(code: string): Promise<GoogleIdentity> {
    const google = this.config.values.google;
    if (!google)
      throw new ApplicationError(
        "INTEGRATION_UNAVAILABLE",
        503,
        "Google sign-in is not configured",
      );
    try {
      const tokenResponse = await this.transport.send(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          body: new URLSearchParams({
            code,
            client_id: google.clientId,
            client_secret: google.clientSecret,
            redirect_uri: google.callbackUrl,
            grant_type: "authorization_code",
          }),
        },
      );
      if (!tokenResponse.ok) throw new Error("Token failed");
      const token = tokenSchema.parse(await tokenResponse.json());
      const response = await this.transport.send(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: { Authorization: `Bearer ${token.access_token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error("Identity failed");
      const info = identitySchema.parse(await response.json());
      return {
        subject: info.sub,
        email: info.email.toLowerCase(),
        name: info.name ?? info.email,
      };
    } catch {
      throw new ApplicationError(
        "OAUTH_INVALID",
        400,
        "Could not verify Google account. Please try signing in again.",
      );
    }
  }
}
