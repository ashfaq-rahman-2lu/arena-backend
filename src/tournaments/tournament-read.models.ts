import { Prisma } from "@prisma/client";
import { z } from "zod";
export const tournamentListSummarySchema = z.array(
  z.object({
    total: z.number().int().nonnegative(),
    tournaments: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    draft: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    entrants: z.number().int().nonnegative(),
  }),
);
export type TournamentListSummaryRecord = z.infer<
  typeof tournamentListSummarySchema
>[number];
export const include = {
  entrants: { orderBy: [{ name: "asc" }, { id: "asc" }] },
  groups: { orderBy: [{ name: "asc" }, { id: "asc" }] },
  matches: {
    orderBy: [
      { scope: "asc" },
      { round: "asc" },
      { leg: "asc" },
      { pairingKey: "asc" },
    ],
  },
  knockoutTies: { orderBy: { slot: "asc" } },
  rounds: { include: { byes: true }, orderBy: { number: "asc" } },
  ties: true,
  qualification: true,
} satisfies Prisma.TournamentInclude;
export const publicInclude = {
  ...include,
  matches: { ...include.matches, omit: { stats: true } },
} satisfies Prisma.TournamentInclude;
export type PublicTournamentRecord = Prisma.TournamentGetPayload<{
  include: typeof publicInclude;
}>;
export type PreviewMatchRecord = Prisma.MatchGetPayload<{
  select: { tournament: { include: typeof include } };
}>;
export type TournamentRecord = Prisma.TournamentGetPayload<{
  include: typeof include;
}>;
