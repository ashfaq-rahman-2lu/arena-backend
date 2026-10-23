import { Match } from "../domain/engine";
export type ResultSnapshot = Omit<Match, "stats">;
/** Preserve correction evidence without retaining archivable stat values. */
export function resultSnapshot(match: Match): ResultSnapshot {
  const { stats, ...snapshot } = match;
  return snapshot;
}
