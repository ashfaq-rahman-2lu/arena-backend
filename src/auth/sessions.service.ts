import { OperationTimingService } from "../common/operation-timing.service";
import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { ConfigurationService } from "../config/configuration.service";
import { RequestContextService } from "../common/request-context.service";
import { SessionCredentials, SessionRecord, SessionView } from "./auth.models";
import { AuthRepository } from "./auth.repository";
import { hash } from "./crypto";
@Injectable()
export class SessionsService {
  constructor(
    private readonly timing: OperationTimingService,
    private readonly repository: AuthRepository,
    private readonly config: ConfigurationService,
    private readonly requests: RequestContextService,
  ) {}
  find(token: string | null): Promise<SessionRecord | null> {
    return this.timing.measure(
      "session.resolve",
      (): Promise<SessionRecord | null> =>
        token ? this.repository.session(hash(token)) : Promise.resolve(null),
    );
  }
  async view(
    token: string | null,
    existingCsrf: string | null,
    resolvedSession?: SessionRecord | null,
  ): Promise<SessionView> {
    const session =
      resolvedSession === undefined ? await this.find(token) : resolvedSession;
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
    this.requests.identify(userId);
    return credentials;
  }
  async revoke(token: string | null): Promise<void> {
    if (token) await this.repository.revokeSession(hash(token));
  }
}
