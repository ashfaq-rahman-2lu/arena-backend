import assert from "node:assert/strict";
import { test } from "node:test";
import {
  additionalFixtures,
  aggregateOutcome,
} from "../src/domain/knockout-rules";
import {
  Competition,
  Match,
  KnockoutTie,
  roundRobin,
} from "../src/domain/engine";
const entrants = ["a", "b", "c", "d", "e"].map(
  (id: string): Competition["entrants"][number] => ({
    id,
    name: id,
    aliases: [],
    groupId: null,
  }),
);
function fixture(
  homeId: string,
  awayId: string,
  leg: number,
  h: number | null,
  a: number | null,
): Match {
  return {
    id: `m${leg}`,
    knockoutTieId: "tie",
    homeId,
    awayId,
    leg,
    round: 1,
    stage: "KNOCKOUT",
    scope: "KNOCKOUT",
    homeScore: h,
    awayScore: a,
    homeTiebreak: null,
    awayTiebreak: null,
    winnerId: null,
    revision: 0,
  };
}
const tie: KnockoutTie = {
  id: "tie",
  roundId: "r",
  slot: 0,
  homeId: "a",
  awayId: "b",
  legs: 2,
  homeTiebreak: null,
  awayTiebreak: null,
  winnerId: null,
};
test("batch additions generate exactly missing pairs and append non-overlapping rounds", (): void => {
  const old = roundRobin(["a", "b", "c"], 2).map(
    (f: ReturnType<typeof roundRobin>[number], i: number): Match => ({
      ...fixture(f.homeId, f.awayId, f.leg, 2, 0),
      ...f,
      id: `old${i}`,
      stage: "LEAGUE",
    }),
  );
  const before = structuredClone(old);
  const added = additionalFixtures(entrants, old, ["d", "e"], 2, "LEAGUE");
  assert.equal(added.length, 14);
  assert.deepEqual(old, before);
  const pairs = new Set(
    added.map(
      (f: ReturnType<typeof roundRobin>[number]): string =>
        `${f.pairingKey}:${f.leg}`,
    ),
  );
  assert.equal(pairs.size, 14);
  const used = new Set<string>();
  for (const f of added) {
    assert.ok(f.round > Math.max(...old.map((m: Match): number => m.round)));
    for (const id of [f.homeId, f.awayId]) {
      assert.ok(!used.has(`${f.round}:${id}`));
      used.add(`${f.round}:${id}`);
    }
  }
});
test("aggregate scores follow identities across reversed legs and await both results", (): void => {
  assert.equal(
    aggregateOutcome(tie, [fixture("a", "b", 1, 3, 0)]).winnerId,
    null,
  );
  assert.deepEqual(
    aggregateOutcome(tie, [
      fixture("a", "b", 1, 3, 0),
      fixture("b", "a", 2, 2, 0),
    ]),
    { homeAggregate: 3, awayAggregate: 2, winnerId: "a", complete: true },
  );
});
test("aggregate tie allows a decision despite a non-drawn second leg", (): void => {
  const matches = [fixture("a", "b", 1, 2, 0), fixture("b", "a", 2, 2, 0)];
  assert.equal(aggregateOutcome(tie, matches).winnerId, null);
  assert.equal(
    aggregateOutcome(tie, matches, { homeTiebreak: 3, awayTiebreak: 4 })
      .winnerId,
    "b",
  );
  assert.equal(aggregateOutcome(tie, matches, { winnerId: "a" }).winnerId, "a");
  assert.throws(
    (): unknown =>
      aggregateOutcome(tie, matches, { homeTiebreak: 3, awayTiebreak: 3 }),
    /decide/,
  );
  assert.throws(
    (): unknown =>
      aggregateOutcome(tie, matches.slice(0, 1), { winnerId: "a" }),
    /Finish/,
  );
});

test("group expansion excludes other groups and repeated batches cover each pair once", (): void => {
  const teams = entrants.map(
    (
      e: Competition["entrants"][number],
      i: number,
    ): Competition["entrants"][number] => ({
      ...e,
      groupId: i === 4 ? "other" : "group",
    }),
  );
  const first = additionalFixtures(teams.slice(0, 3), [], ["c"], 1, "group");
  const stored = first.map(
    (f: ReturnType<typeof roundRobin>[number], i: number): Match => ({
      ...fixture(f.homeId, f.awayId, f.leg, null, null),
      ...f,
      id: `first${i}`,
      stage: "GROUP",
    }),
  );
  const second = additionalFixtures(teams, stored, ["d", "e"], 1, "group");
  assert.equal(first.length, 2);
  assert.equal(second.length, 3);
  assert.ok(
    second.every(
      (f: ReturnType<typeof roundRobin>[number]): boolean =>
        f.homeId !== "e" && f.awayId !== "e",
    ),
  );
});
