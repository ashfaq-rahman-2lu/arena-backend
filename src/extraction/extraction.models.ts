import { z } from "zod";
import { Entrant } from "../domain/engine";
export type ExtractionMode = "scores" | "full";
export const matchStat = z
  .object({
    key: z.enum([
      "possession",
      "shots",
      "shotsOnTarget",
      "fouls",
      "offsides",
      "cornerKicks",
      "freeKicks",
      "passes",
      "successfulPasses",
      "crosses",
      "interceptions",
      "tackles",
      "saves",
    ]),
    label: z.string().min(1).max(50),
    home: z.number().int().min(0).max(9999).nullable(),
    away: z.number().int().min(0).max(9999).nullable(),
    unit: z.enum(["percent", "count"]),
  })
  .superRefine((stat: MatchStat, ctx: z.RefinementCtx): void => {
    if ((stat.key === "possession") !== (stat.unit === "percent"))
      ctx.addIssue({ code: "custom", message: "Invalid stat unit" });
    if (
      stat.unit === "percent" &&
      [stat.home, stat.away].some(
        (value: number | null): boolean => value !== null && value > 100,
      )
    )
      ctx.addIssue({ code: "custom", message: "Invalid percentage" });
  });
export interface MatchStat {
  key:
    | "possession"
    | "shots"
    | "shotsOnTarget"
    | "fouls"
    | "offsides"
    | "cornerKicks"
    | "freeKicks"
    | "passes"
    | "successfulPasses"
    | "crosses"
    | "interceptions"
    | "tackles"
    | "saves";
  label: string;
  home: number | null;
  away: number | null;
  unit: "percent" | "count";
}
export const matchStats = z
  .array(matchStat)
  .max(13)
  .refine(
    (stats: MatchStat[]): boolean =>
      new Set(stats.map((stat: MatchStat): string => stat.key)).size ===
      stats.length,
    "Duplicate match stats",
  );
const observed = z.object({
  name: z.string().nullable(),
  score: z.number().int().nonnegative().max(2147483647).nullable(),
  tiebreak: z.number().int().nonnegative().max(2147483647).nullable(),
});
export const extracted = z.object({
  sides: z.array(observed).length(2),
  stats: matchStats.optional(),
  warnings: z.array(z.string().max(500)).max(40),
});
export type Extracted = z.infer<typeof extracted>;
export abstract class VisionProvider {
  abstract read(
    image: Buffer,
    entrants: Entrant[],
    mode?: ExtractionMode,
  ): Promise<Extracted>;
}
