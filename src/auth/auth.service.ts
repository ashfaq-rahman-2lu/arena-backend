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
