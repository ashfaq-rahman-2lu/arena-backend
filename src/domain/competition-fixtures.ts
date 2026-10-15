import type { Match, ScheduledFixture } from "./engine";
export class RuleError extends Error {}
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new RuleError(message);
}
export function completed(m: Match): boolean {
  return m.homeScore !== null && m.awayScore !== null;
}
export function pairingKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}
// Circle method: one idle entrant per round for odd-sized fields; all rounds are informational.
export function roundRobin(
  ids: string[],
  legs: number,
  scope: string = "LEAGUE",
): ScheduledFixture[] {
  invariant(new Set(ids).size === ids.length, "Duplicate entrants");
  invariant(ids.length >= 2, "At least two entrants are required");
  invariant(legs === 1 || legs === 2, "Choose one or two legs");
  const ring: (string | null)[] = [...ids];
  if (ring.length % 2) ring.push(null);
  const fixtures: ScheduledFixture[] = [];
  for (let r = 0; r < ring.length - 1; r++) {
    for (let i = 0; i < ring.length / 2; i++) {
      let a = ring[i],
        b = ring[ring.length - 1 - i];
      if (!a || !b) continue;
      if ((r + i) % 2) [a, b] = [b, a];
      fixtures.push({
        homeId: a,
        awayId: b,
        round: r + 1,
        leg: 1,
        scope,
        pairingKey: pairingKey(a, b),
      });
      if (legs === 2)
        fixtures.push({
          homeId: b,
          awayId: a,
          round: r + ring.length,
          leg: 2,
          scope,
          pairingKey: pairingKey(a, b),
        });
    }
    const last = ring.pop();
    if (last === undefined) throw new RuleError("Fixture ring is empty");
    ring.splice(1, 0, last);
  }
  return fixtures.sort(
    (a: ScheduledFixture, b: ScheduledFixture): number => a.round - b.round,
  );
}
