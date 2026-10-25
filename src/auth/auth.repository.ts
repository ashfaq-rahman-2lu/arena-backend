import { Injectable } from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { ApplicationError } from "../common/application-error";
import { DatabaseService } from "../database/database.service";
import {
  Account,
  GoogleIdentity,
  OAuthAttemptAction,
  OAuthAttemptRecord,
  SessionRecord,
  TokenPurpose,
} from "./auth.models";
function account(record: User): Account {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    passwordHash: record.passwordHash,
    verified: record.verified,
  };
}
@Injectable()
export class AuthRepository {
  constructor(private readonly db: DatabaseService) {}
  async createOAuthAttempt(
    stateHash: string,
    action: OAuthAttemptAction,
    userId: string | null,
    sessionId: string | null,
    proposedEmail: string | null,
    returnTo: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.oAuthAttempt.create({
      data: {
        stateHash,
        action,
        userId,
        sessionId,
        proposedEmail,
        returnTo,
        expiresAt,
      },
    });
  }
  async consumeOAuthAttempt(stateHash: string): Promise<OAuthAttemptRecord> {
    return this.db.$transaction(
      async (tx: Prisma.TransactionClient): Promise<OAuthAttemptRecord> => {
        const attempt = await tx.oAuthAttempt.findUnique({
          where: { stateHash },
        });
        if (
          !attempt ||
          attempt.expiresAt <= new Date() ||
          !(await tx.oAuthAttempt.deleteMany({ where: { id: attempt.id } }))
            .count
        )
          throw new ApplicationError(
            "OAUTH_INVALID",
            400,
            "Google sign-in expired or was already used",
          );
        return {
          action: attempt.action,
          userId: attempt.userId,
          sessionId: attempt.sessionId,
          proposedEmail: attempt.proposedEmail,
          returnTo: attempt.returnTo,
          expiresAt: attempt.expiresAt,
        };
      },
    );
  }
  async findAccount(email: string): Promise<Account | null> {
    const user = await this.db.user.findUnique({ where: { email } });
    return user ? account(user) : null;
  }
  async findById(id: string): Promise<Account | null> {
    const user = await this.db.user.findUnique({ where: { id } });
    return user ? account(user) : null;
  }
  async updateName(userId: string, name: string): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { name } });
  }
  async changePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db.$transaction(
      async (tx: Prisma.TransactionClient): Promise<void> => {
        await tx.user.update({ where: { id: userId }, data: { passwordHash } });
        await tx.session.deleteMany({ where: { userId } });
        await tx.authToken.deleteMany({
          where: { userId, purpose: { in: ["RESET", "EMAIL_CHANGE"] } },
        });
      },
    );
  }
  async createAccount(
    name: string,
    email: string,
    passwordHash: string,
  ): Promise<Account> {
    return account(
      await this.db.user.create({ data: { name, email, passwordHash } }),
    );
  }
  async session(id: string): Promise<SessionRecord | null> {
    const record = await this.db.session.findFirst({
      where: { id, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    return record
      ? {
          id: record.id,
          userId: record.userId,
          csrf: record.csrf,
          user: account(record.user),
        }
      : null;
  }
  async googleLinked(userId: string): Promise<boolean> {
    return Boolean(
      await this.db.authIdentity.findFirst({
        where: { userId, provider: "google" },
      }),
    );
  }
  async verifyGoogleIdentity(
    userId: string,
    subject: string,
    sessionId: string,
  ): Promise<void> {
    await this.db.$transaction(
      async (tx: Prisma.TransactionClient): Promise<void> => {
        const session = await tx.session.findFirst({
          where: { id: sessionId, userId, expiresAt: { gt: new Date() } },
          select: { id: true },
        });
        if (!session)
          throw new ApplicationError(
            "UNAUTHENTICATED",
            401,
            "The initiating session is no longer active",
          );
        const identity = await tx.authIdentity.findUnique({
          where: { provider_subject: { provider: "google", subject } },
          select: { userId: true },
        });
        if (identity?.userId !== userId)
          throw new ApplicationError(
            "OAUTH_INVALID",
            400,
            "Confirm the Google account already linked to this profile",
          );
      },
    );
  }
  async createSession(id: string, userId: string, csrf: string): Promise<void> {
    await this.db.session.create({
      data: {
        id,
        userId,
        csrf,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
  }
  async revokeSession(id: string): Promise<void> {
    await this.db.session.deleteMany({ where: { id } });
  }
  async createToken(
    id: string,
    userId: string,
    purpose: TokenPurpose,
    value?: string,
  ): Promise<void> {
    await this.db.authToken.create({
      data: {
        id,
        userId,
        purpose,
        value,
        expiresAt: new Date(
          Date.now() + (purpose === "VERIFY" ? 86400000 : 3600000),
        ),
      },
    });
  }
  async removeToken(id: string): Promise<void> {
    await this.db.authToken.deleteMany({ where: { id } });
  }
  async consumeToken(
    id: string,
    purpose: TokenPurpose,
    passwordHash?: string,
  ): Promise<void> {
    await this.db.$transaction(
      async (tx: Prisma.TransactionClient): Promise<void> => {
        const key = await tx.authToken.findFirst({
          where: { id, purpose, expiresAt: { gt: new Date() } },
        });
        if (
          !key ||
          !(await tx.authToken.deleteMany({ where: { id: key.id } })).count
        )
          throw new ApplicationError(
            "INVALID_TOKEN",
            400,
            "Link is invalid, expired, or already used",
          );
        if (purpose === "EMAIL_CHANGE") {
          const value: unknown = key.value ? JSON.parse(key.value) : null;
          if (
            !value ||
            typeof value !== "object" ||
            !("email" in value) ||
            typeof value.email !== "string" ||
            !("previousEmail" in value) ||
            typeof value.previousEmail !== "string"
          )
            throw new ApplicationError(
              "INVALID_TOKEN",
              400,
              "Link is invalid, expired, or already used",
            );
          const current = await tx.user.findUnique({
            where: { id: key.userId },
            select: { email: true },
          });
          if (!current || current.email !== value.previousEmail)
            throw new ApplicationError(
              "INVALID_TOKEN",
              400,
              "Account email changed before this link was used",
            );
          await tx.user.update({
            where: { id: key.userId },
            data: { email: value.email, verified: true },
          });
        } else {
          await tx.user.update({
            where: { id: key.userId },
            data: { verified: true, ...(passwordHash ? { passwordHash } : {}) },
          });
        }
        if (purpose === "RESET" || purpose === "EMAIL_CHANGE") {
          await tx.session.deleteMany({ where: { userId: key.userId } });
          await tx.authToken.deleteMany({
            where: {
              userId: key.userId,
              purpose: { in: ["RESET", "EMAIL_CHANGE"] },
            },
          });
        }
      },
    );
  }
  async resolveGoogle(
    info: GoogleIdentity,
    linkUserId: string | null,
    initiatingSessionId: string | null,
  ): Promise<string> {
    return this.db.$transaction(
      async (tx: Prisma.TransactionClient): Promise<string> => {
        if (linkUserId) {
          const session = await tx.session.findFirst({
            where: {
              id: initiatingSessionId ?? "",
              userId: linkUserId,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          });
          if (!session)
            throw new ApplicationError(
              "UNAUTHENTICATED",
              401,
              "The initiating session is no longer active",
            );
        }
        const identity = await tx.authIdentity.findUnique({
          where: {
            provider_subject: { provider: "google", subject: info.subject },
          },
        });
        if (identity) {
          if (linkUserId && identity.userId !== linkUserId)
            throw new ApplicationError(
              "OAUTH_INVALID",
              400,
              "Google account is already linked to another admin",
            );
          return identity.userId;
        }
        let userId = linkUserId;
        if (!userId) {
          if (await tx.user.findUnique({ where: { email: info.email } }))
            throw new ApplicationError(
              "OAUTH_INVALID",
              400,
              "Sign in using your existing method, then link Google from your dashboard",
            );
          userId = (
            await tx.user.create({
              data: { email: info.email, name: info.name, verified: true },
            })
          ).id;
        }
        if (
          await tx.authIdentity.findFirst({
            where: { userId, provider: "google" },
          })
        )
          throw new ApplicationError(
            "OAUTH_INVALID",
            400,
            "A Google account is already linked",
          );
        await tx.authIdentity.create({
          data: { userId, provider: "google", subject: info.subject },
        });
        return userId;
      },
    );
  }
}
