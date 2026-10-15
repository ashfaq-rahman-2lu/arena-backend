import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Competition,
  knockoutEligibility,
  previewFixtures,
} from "../src/domain/engine";
export function knockout(): Competition {
  return {
    id: "t",
    publicId: "KNOCKOUT",
    name: "Cup",
    game: "EFOOTBALL",
    format: "KNOCKOUT" as Competition["format"],
    status: "ACTIVE",
    currentStage: "KNOCKOUT",
    revision: 0,
    legs: 1,
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    championId: null,
    entrants: ["a", "b", "c"].map(
      (id: string): Competition["entrants"][number] => ({
        id,
        name: id,
        aliases: [],
        groupId: null,
      }),
    ),
    groups: [],
    matches: [],
    rounds: [],
    ties: [],
    qualification: null,
  };
}
test("only knockout has no round-robin preview", (): void => {
  assert.deepEqual(previewFixtures(knockout()), []);
});
test("only knockout starts with all entrants eligible and the required byes", (): void => {
  assert.deepEqual(knockoutEligibility(knockout()), {
    round: 1,
    entrantIds: ["a", "b", "c"],
    byeCount: 1,
  });
});

test("two-leg eligibility waits for the aggregate winner instead of individual leg winners", (): void => {
  const t = knockout();
  t.rounds = [{ id: "r", number: 1, byes: [{ entrantId: "c", slot: 1 }] }];
  t.knockoutTies = [
    {
      id: "tie",
      roundId: "r",
      slot: 0,
      homeId: "a",
      awayId: "b",
      legs: 2,
      homeTiebreak: null,
      awayTiebreak: null,
      winnerId: null,
    },
  ];
  assert.throws((): unknown => knockoutEligibility(t), /Finish/);
  t.knockoutTies[0].winnerId = "b";
  assert.deepEqual(knockoutEligibility(t).entrantIds, ["b", "c"]);
});

test("all supported field sizes have valid first-round bye counts", (): void => {
  for (let count = 2; count <= 256; count++) {
    const t = knockout();
    t.entrants = Array.from(
      { length: count },
      (_: unknown, i: number): Competition["entrants"][number] => ({
        id: String(i),
        name: String(i),
        aliases: [],
        groupId: null,
      }),
    );
    const e = knockoutEligibility(t);
    const matches = (count - e.byeCount) / 2;
    const survivors = matches + e.byeCount;
    assert.ok(Number.isInteger(matches) && matches > 0);
    assert.equal(Math.log2(survivors) % 1, 0);
  }
});
