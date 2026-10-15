import { completed, invariant, roundRobin } from "./competition-fixtures";
import type { Entrant, Match, KnockoutTie, ScheduledFixture } from "./engine";
export interface TieDecision {
  homeTiebreak?: number | null;
  awayTiebreak?: number | null;
  winnerId?: string | null;
}
export interface AggregateOutcome {
  homeAggregate: number;
  awayAggregate: number;
  winnerId: string | null;
  complete: boolean;
}
export function additionalFixtures(
  entrants: Entrant[],
  matches: Match[],
  newIds: string[],
  legs: number,
  scope: string,
): ScheduledFixture[] {
  const selected = entrants.filter(
    (e: Entrant): boolean => scope === "LEAGUE" || e.groupId === scope,
  );
  const added = new Set(newIds);
  const fixtures = roundRobin(
    selected.map((e: Entrant): string => e.id),
    legs,
    scope,
  ).filter(
    (f: ScheduledFixture): boolean =>
      added.has(f.homeId) || added.has(f.awayId),
  );
  const offset = Math.max(
    0,
    ...matches
      .filter((m: Match): boolean => m.scope === scope)
      .map((m: Match): number => m.round),
  );
  const rounds = [
    ...new Set(fixtures.map((f: ScheduledFixture): number => f.round)),
  ].sort((a: number, b: number): number => a - b);
  return fixtures.map((f: ScheduledFixture): ScheduledFixture => ({
    ...f,
    round: offset + rounds.indexOf(f.round) + 1,
  }));
}
export function aggregateOutcome(
  tie: KnockoutTie,
  matches: Match[],
  decision?: TieDecision,
): AggregateOutcome {
  const legs = matches.filter(
    (m: Match): boolean => m.knockoutTieId === tie.id,
  );
  const done = legs.length === tie.legs && legs.every(completed);
  let homeAggregate = 0,
    awayAggregate = 0;
  for (const m of legs) {
    homeAggregate += (m.homeId === tie.homeId ? m.homeScore : m.awayScore) ?? 0;
    awayAggregate += (m.homeId === tie.awayId ? m.homeScore : m.awayScore) ?? 0;
  }
  const hasDecision =
    decision &&
    (decision.winnerId != null ||
      decision.homeTiebreak != null ||
      decision.awayTiebreak != null);
  invariant(!hasDecision || done, "Finish both legs before deciding the tie");
  let winnerId =
    !done || homeAggregate === awayAggregate
      ? null
      : homeAggregate > awayAggregate
        ? tie.homeId
        : tie.awayId;
  if (hasDecision) {
    invariant(
      homeAggregate === awayAggregate,
      "A tie decision requires a tied aggregate",
    );
    const h = decision.homeTiebreak ?? null,
      a = decision.awayTiebreak ?? null;
    invariant((h === null) === (a === null), "Enter both tiebreak scores");
    if (h !== null && a !== null) {
      invariant(h !== a, "Tiebreak scores must decide a winner");
      winnerId = h > a ? tie.homeId : tie.awayId;
    } else winnerId = decision.winnerId ?? null;
    invariant(
      winnerId === tie.homeId || winnerId === tie.awayId,
      "Choose a winner for the tied aggregate",
    );
    invariant(
      !decision.winnerId || winnerId === decision.winnerId,
      "Selected winner contradicts the tiebreak scores",
    );
  }
  return { homeAggregate, awayAggregate, winnerId, complete: done };
}
