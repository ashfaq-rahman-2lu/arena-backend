import * as argon2 from "argon2";
import { execFileSync } from "node:child_process";
import { createApp } from "../src/app";
import { BrowserAccountFixture } from "./browser-account-fixture";
import { offlineEnvironment } from "../src/config/configuration";
import { DatabaseService } from "../src/database/database.service";
import { Entrant } from "../src/domain/engine";
import { Extracted, VisionProvider } from "../src/extraction/extraction.models";
import { TournamentsService } from "../src/tournaments/tournaments.service";
async function main(): Promise<void> {
  const databaseUrl = process.env.BROWSER_DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).pathname !== "/arena_browser_test")
    throw new Error("BROWSER_DATABASE_URL must point to arena_browser_test");
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "prisma/schema.prisma",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    },
  );
  const accounts = new BrowserAccountFixture();
  const vision: VisionProvider = {
    read: async (_image: Buffer, entrants: Entrant[]): Promise<Extracted> => ({
      sides: entrants.map(
        (entrant: Entrant, index: number): Extracted["sides"][number] => ({
          name: entrant.name,
          score: index === 0 ? 4 : 0,
          tiebreak: null,
        }),
      ),
      warnings: [],
    }),
  };
  const app = await createApp({
    environment: {
      ...offlineEnvironment,
      DATABASE_URL: databaseUrl,
      FRONTEND_URL: "http://127.0.0.1:5174",
      PORT: "3001",
      AUTH_RATE_LIMIT: "1000",
      EXTRACTION_RATE_LIMIT: "1000",
      GOOGLE_CLIENT_ID: "local-fake-client",
      GOOGLE_CLIENT_SECRET: "local-fake-secret",
      GOOGLE_CALLBACK_URL: "http://127.0.0.1:3001/api/v1/auth/google/callback",
    },
    email: accounts,
    oauth: accounts,
    vision,
  });
  accounts.install(app);
  await app.init();
  const db = app.get(DatabaseService);
  await db.$transaction([
    db.round.deleteMany(),
    db.tournament.deleteMany(),
    db.user.deleteMany(),
  ]);
  const owner = await db.user.create({
    data: {
      email: "browser@arena.test",
      name: "Browser admin",
      passwordHash: await argon2.hash("BrowserArena2026!", {
        type: argon2.argon2id,
      }),
      verified: true,
    },
  });
  const service = app.get(TournamentsService);
  for (let index = 0; index < 22; index++)
    await service.create(owner.id, {
      name: `Browser draft ${String(index).padStart(2, "0")}`,
      game: "EFOOTBALL",
      format: "LEAGUE",
      knockoutLegs: 1,
      knockoutFinalLegs: 1,
      legs: 1,
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      groups: [],
      entrants: [
        { name: "Alpha", aliases: [] },
        { name: "Beta", aliases: [] },
      ],
    });
  const large = await service.create(owner.id, {
    name: "Large league with long team names",
    game: "EFOOTBALL",
    format: "LEAGUE",
    knockoutLegs: 1,
    knockoutFinalLegs: 1,
    legs: 1,
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    groups: [],
    entrants: Array.from(
      { length: 64 },
      (
        _value: unknown,
        index: number,
      ): { name: string; aliases: string[] } => ({
        name: `Team ${index} with a long but readable competition name`,
        aliases: [],
      }),
    ),
  });
  await service.start(large.id, owner.id, large.revision);
  await app.listen(3001, "127.0.0.1");
}
void main().catch((error: unknown): void => {
  console.error(
    error instanceof Error ? error.message : "Browser server failed",
  );
  process.exitCode = 1;
});
