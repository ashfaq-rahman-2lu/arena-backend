import { Prisma, PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import "dotenv/config";
import { roundRobin } from "../src/domain/engine";
const db = new PrismaClient();
async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production")
    throw new Error("The demo seed is for local development only");
  const owner = await db.user.upsert({
    where: { email: "demo@arena.local" },
    update: {},
    create: {
      name: "Alex",
      email: "demo@arena.local",
      verified: true,
      passwordHash: await argon2.hash("ArenaDemo2026!", {
        type: argon2.argon2id,
      }),
    },
  });
  if (await db.tournament.findUnique({ where: { publicId: "ARENA2026" } })) {
    console.log("Demo already exists.");
    return;
  }
  await db.$transaction(async (tx: Prisma.TransactionClient): Promise<void> => {
    const t = await tx.tournament.create({
      data: {
        ownerId: owner.id,
        publicId: "ARENA2026",
        name: "Friday Night Rivals",
        game: "EFOOTBALL",
        format: "LEAGUE",
        status: "ACTIVE",
        currentStage: "LEAGUE",
        revision: 1,
      },
    });
    const names = [
      "Northside FC",
      "Pixel United",
      "Red Dragons",
      "Blue Knights",
      "Goal Diggers",
      "Last Minute FC",
    ];
    const entrants = [];
    for (const name of names)
      entrants.push(
        await tx.entrant.create({
          data: {
            name,
            nameKey: name.toLowerCase(),
            aliases: [],
            tournamentId: t.id,
          },
        }),
      );
    const fixtures = roundRobin(
      entrants.map(
        (e: {
          name: string;
          id: string;
          nameKey: string;
          aliases: string[];
          tournamentId: string;
          groupId: string | null;
        }): string => e.id,
      ),
      1,
    );
    await tx.match.createMany({
      data: fixtures.map(
        (
          f: {
            homeId: string;
            awayId: string;
            round: number;
            leg: number;
            scope: string;
            pairingKey: string;
          },
          i: number,
        ): {
          homeScore?: number | undefined;
          awayScore?: number | undefined;
          winnerId?: string | null | undefined;
          revision?: number | undefined;
          tournamentId: string;
          stage: "LEAGUE" | "GROUP" | "KNOCKOUT";
          homeId: string;
          awayId: string;
          round: number;
          leg: number;
          scope: string;
          pairingKey: string;
        } => ({
          ...f,
          tournamentId: t.id,
          stage: "LEAGUE",
          ...(i < 6
            ? {
                homeScore: [3, 1, 2, 0, 4, 2][i],
                awayScore: [1, 1, 0, 2, 2, 2][i],
                winnerId:
                  [3, 1, 2, 0, 4, 2][i] > [1, 1, 0, 2, 2, 2][i]
                    ? f.homeId
                    : [3, 1, 2, 0, 4, 2][i] < [1, 1, 0, 2, 2, 2][i]
                      ? f.awayId
                      : null,
                revision: 1,
              }
            : {}),
        }),
      ),
    });
  });
  console.log(
    "Seeded Friday Night Rivals. Public ID: ARENA2026. Demo login: demo@arena.local / ArenaDemo2026!",
  );
}
main()
  .catch((e: unknown): void => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally((): Promise<void> => db.$disconnect());
