import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { ApplicationError } from "../common/application-error";
import { LoginInput, RegistrationInput } from "./auth-request.dto";
import { MessageResult } from "./auth.models";
import { AuthRepository } from "./auth.repository";
import { TokensService } from "./tokens.service";
@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: TokensService,
  ) {}
  account(userId: string): Promise<import("./auth.models").Account | null> {
    return this.repository.findById(userId);
  }
  async updateName(userId: string, name: string): Promise<MessageResult> {
    await this.repository.updateName(userId, name);
    return { message: "Profile updated." };
  }
  async changePassword(
    userId: string,
    currentPassword: string,
    password: string,
  ): Promise<MessageResult> {
    const user = await this.repository.findById(userId);
    if (
      !user?.passwordHash ||
      !(await argon2.verify(user.passwordHash, currentPassword))
    )
      throw new ApplicationError(
        "UNAUTHENTICATED",
        401,
        "Current password is incorrect",
      );
    await this.repository.changePassword(
      userId,
      await argon2.hash(password, { type: argon2.argon2id }),
    );
    return { message: "Password updated. Sign in again." };
  }
  async register(input: RegistrationInput): Promise<MessageResult> {
    if (!(await this.repository.findAccount(input.email))) {
      const user = await this.repository.createAccount(
        input.name,
        input.email,
        await argon2.hash(input.password, { type: argon2.argon2id }),
      );
      await this.tokens.deliver(user.id, user.email, "VERIFY");
    }
    return {
      message:
        "If this address is new, a verification email has been sent. Otherwise, sign in or reset your password.",
    };
  }
  async login(input: LoginInput): Promise<string> {
    const user = await this.repository.findAccount(input.email);
    const valid = user?.passwordHash
      ? await argon2.verify(user.passwordHash, input.password)
      : Boolean(await argon2.hash(input.password)) && false;
    if (!user || !valid)
      throw new ApplicationError(
        "UNAUTHENTICATED",
        401,
        "Incorrect email or password",
      );
    if (!user.verified)
      throw new ApplicationError(
        "EMAIL_VERIFICATION_REQUIRED",
        403,
        "Verify your email before signing in",
      );
    return user.id;
  }
}
