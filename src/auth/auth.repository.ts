import { Injectable } from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { ApplicationError } from "../common/application-error";
import { DatabaseService } from "../database/database.service";
import {
  Account,
  GoogleIdentity,
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
  async findAccount(email: string): Promise<Account | null> {
    const user = await this.db.user.findUnique({ where: { email } });
    return user ? account(user) : null;
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
  ): Promise<void> {
    await this.db.authToken.create({
      data: {
        id,
        userId,
        purpose,
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
        await tx.user.update({
          where: { id: key.userId },
          data: { verified: true, ...(passwordHash ? { passwordHash } : {}) },
        });
        if (purpose === "RESET") {
          await tx.session.deleteMany({ where: { userId: key.userId } });
          await tx.authToken.deleteMany({
            where: { userId: key.userId, purpose: "RESET" },
          });
        }
      },
    );
  }
  async resolveGoogle(
    info: GoogleIdentity,
    linkUserId: string | null,
  ): Promise<string> {
    return this.db.$transaction(
      async (tx: Prisma.TransactionClient): Promise<string> => {
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
