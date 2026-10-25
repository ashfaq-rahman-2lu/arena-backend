import { Inject, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { ConfigurationService } from "../config/configuration.service";
import {
  EmailChangeDecision,
  MessageResult,
  TokenPurpose,
} from "./auth.models";
import { AuthRepository } from "./auth.repository";
import { hash } from "./crypto";
import { EmailPort } from "./smtp-email.adapter";
import { ApplicationError } from "../common/application-error";
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
    value?: string,
  ): Promise<void> {
    const token = randomBytes(32).toString("hex");
    await this.repository.createToken(hash(token), userId, purpose, value);
    const link = `${this.config.values.frontendUrl}/auth/${purpose === "VERIFY" ? "verify" : purpose === "EMAIL_CHANGE" ? "email-confirm" : "reset"}?token=${token}`;
    try {
      await this.email.send({
        to: email,
        subject:
          purpose === "VERIFY"
            ? "Verify your Arena account"
            : purpose === "EMAIL_CHANGE"
              ? "Confirm your new Arena email"
              : "Set or reset your Arena password",
        text: `${purpose === "VERIFY" ? "Verify your account" : purpose === "EMAIL_CHANGE" ? "Confirm your new email" : "Set or reset your password"}: ${link}\nIf you did not request this, ignore this message.`,
      });
    } catch (error: unknown) {
      await this.repository.removeToken(hash(token));
      throw error;
    }
  }
  async requestEmailChange(
    userId: string,
    email: string,
    currentPassword?: string,
    googleConfirmed: boolean = false,
  ): Promise<EmailChangeDecision> {
    const user = await this.repository.findById(userId);
    if (!user)
      throw new ApplicationError("UNAUTHENTICATED", 401, "Sign in to continue");
    if (user.email === email)
      return {
        status: "verification_sent",
        message: "That is already your account email.",
      };
    if (user.passwordHash) {
      if (
        !currentPassword ||
        !(await argon2.verify(user.passwordHash, currentPassword))
      )
        throw new ApplicationError(
          "UNAUTHENTICATED",
          401,
          "Current password is incorrect",
        );
    } else if (!(await this.repository.googleLinked(userId))) {
      throw new ApplicationError(
        "UNAUTHENTICATED",
        401,
        "Confirm an account sign-in method before changing email",
      );
    }
    if (await this.repository.findAccount(email))
      throw new ApplicationError(
        "ALREADY_EXISTS",
        409,
        "That email is already in use",
      );
    if (!user.passwordHash && !googleConfirmed)
      return { status: "google_confirmation_required" };
    await this.deliver(
      user.id,
      email,
      "EMAIL_CHANGE",
      JSON.stringify({ email, previousEmail: user.email }),
    );
    return {
      status: "verification_sent",
      message: "Confirm the new email using the link we sent.",
    };
  }
  async send(email: string, purpose: TokenPurpose): Promise<MessageResult> {
    const user = await this.repository.findAccount(email);
    if (user && (purpose === "RESET" ? user.verified : !user.verified))
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
  async confirmEmail(token: string): Promise<MessageResult> {
    await this.repository.consumeToken(hash(token), "EMAIL_CHANGE");
    return { message: "Email updated. Sign in again." };
  }
}
