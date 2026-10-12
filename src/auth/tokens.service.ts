import { Inject, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { ConfigurationService } from "../config/configuration.service";
import { MessageResult, TokenPurpose } from "./auth.models";
import { AuthRepository } from "./auth.repository";
import { hash } from "./crypto";
import { EmailPort } from "./smtp-email.adapter";
@Injectable()
export class TokensService {
  constructor(
    private readonly repository: AuthRepository,
    @Inject(EmailPort) private readonly email: EmailPort,
    private readonly config: ConfigurationService,
  ) {}
  async deliver(
    userId: string,
    email: string,
    purpose: TokenPurpose,
  ): Promise<void> {
    const token = randomBytes(32).toString("hex");
    await this.repository.createToken(hash(token), userId, purpose);
    const link = `${this.config.values.frontendUrl}/auth/${purpose === "VERIFY" ? "verify" : "reset"}?token=${token}`;
    try {
      await this.email.send({
        to: email,
        subject:
          purpose === "VERIFY"
            ? "Verify your Arena account"
            : "Reset your Arena password",
        text: `${purpose === "VERIFY" ? "Verify your account" : "Reset your password"}: ${link}\nIf you did not request this, ignore this message.`,
      });
    } catch (error: unknown) {
      await this.repository.removeToken(hash(token));
      throw error;
    }
  }
  async send(email: string, purpose: TokenPurpose): Promise<MessageResult> {
    const user = await this.repository.findAccount(email);
    if (
      user &&
      (purpose === "RESET" ? Boolean(user.passwordHash) : !user.verified)
    )
      await this.deliver(user.id, email, purpose);
    return { message: "If the account is eligible, an email has been sent." };
  }
  async verify(token: string): Promise<MessageResult> {
    await this.repository.consumeToken(hash(token), "VERIFY");
    return { message: "Email verified. You can now sign in." };
  }
  async reset(token: string, password: string): Promise<MessageResult> {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.repository.consumeToken(hash(token), "RESET", passwordHash);
    return { message: "Password updated. Sign in again." };
  }
}
