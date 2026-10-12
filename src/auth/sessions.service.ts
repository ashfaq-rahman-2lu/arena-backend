import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { ConfigurationService } from "../config/configuration.service";
import { SessionCredentials, SessionRecord, SessionView } from "./auth.models";
import { AuthRepository } from "./auth.repository";
import { hash } from "./crypto";
@Injectable()
export class SessionsService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: ConfigurationService,
  ) {}
  find(token: string | null): Promise<SessionRecord | null> {
    return token ? this.repository.session(hash(token)) : Promise.resolve(null);
  }
  async view(
    token: string | null,
    existingCsrf: string | null,
  ): Promise<SessionView> {
    const session = await this.find(token);
    return {
      csrf: session?.csrf ?? existingCsrf ?? randomBytes(24).toString("hex"),
      user: session
        ? {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            hasPassword: Boolean(session.user.passwordHash),
            googleLinked: await this.repository.googleLinked(session.userId),
          }
        : null,
      googleEnabled: Boolean(this.config.values.google),
    };
  }
  async create(userId: string): Promise<SessionCredentials> {
    const credentials = {
      token: randomBytes(32).toString("hex"),
      csrf: randomBytes(24).toString("hex"),
    };
    await this.repository.createSession(
      hash(credentials.token),
      userId,
      credentials.csrf,
    );
    return credentials;
  }
  async revoke(token: string | null): Promise<void> {
    if (token) await this.repository.revokeSession(hash(token));
  }
}
