import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Competition,
  Entrant,
  Match,
  Standing,
  completion,
  correctionImpact,
  knockoutEligibility,
  previewFixtures,
  qualificationPreview,
  roundRobin,
  standings,
  validatePairings,
  validateScore,
} from "../src/domain/engine";
import { required } from "../src/domain/required";
function league(n: number = 4): Competition {
  const t: Competition = {
    id: "t",
    publicId: "TEST",
    name: "Test",
    game: "EFOOTBALL",
    format: "LEAGUE",
    status: "ACTIVE",
    currentStage: "LEAGUE",
    revision: 0,
    legs: 1,
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    championId: null,
    entrants: Array.from(
      { length: n },
      (
        _: unknown,
        i: number,
      ): {
        id: string;
        name: string;
        aliases: never[];
        groupId: null;
      } => ({
        id: `e${i}`,
        name: `Team ${i}`,
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
  t.matches = roundRobin(
    t.entrants.map((e: Entrant): string => e.id),
    1,
  ).map(
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
      id: string;
      stage: "LEAGUE" | "GROUP" | "KNOCKOUT";
      homeScore: null;
      awayScore: null;
      homeTiebreak: null;
      awayTiebreak: null;
      winnerId: null;
      revision: number;
      homeId: string;
      awayId: string;
      round: number;
      leg: number;
      scope: string;
      pairingKey: string;
    } => ({
      ...f,
      id: `m${i}`,
      stage: "LEAGUE",
      homeScore: null,
      awayScore: null,
      homeTiebreak: null,
      awayTiebreak: null,
      winnerId: null,
      revision: 0,
    }),
  );
  return t;
}
function groups(): Competition {
  const t = league(6);
  t.format = "WORLD_CUP";
  t.currentStage = "GROUP";
  t.groups = [
    { id: "a", name: "Group A", qualifierCount: 2 },
    { id: "b", name: "Group B", qualifierCount: 3 },
  ];
  t.entrants.forEach(
    (e: Entrant, i: number): "a" | "b" => (e.groupId = i < 3 ? "a" : "b"),
  );
  t.matches = previewFixtures(t).map(
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
      id: string;
      stage: "LEAGUE" | "GROUP" | "KNOCKOUT";
      homeScore: number;
      awayScore: number;
      homeTiebreak: null;
      awayTiebreak: null;
      winnerId: null;
      revision: number;
      homeId: string;
      awayId: string;
      round: number;
      leg: number;
      scope: string;
      pairingKey: string;
    } => ({
      ...f,
      id: `m${i}`,
      stage: "GROUP",
      homeScore: 1,
      awayScore: 1,
      homeTiebreak: null,
      awayTiebreak: null,
      winnerId: null,
      revision: 0,
    }),
  );
  return t;
}
for (let n = 2; n <= 11; n++)
  for (const legs of [1, 2])
    test(`round robin: ${n} entrants, ${legs} leg(s)`, (): void => {
      const fixtures = roundRobin(
        Array.from({ length: n }, (_: unknown, i: number): string => String(i)),
        legs,
      );
      assert.equal(fixtures.length, ((n * (n - 1)) / 2) * legs);
      assert(
        fixtures.every(
          (f: {
            homeId: string;
            awayId: string;
            round: number;
            leg: number;
            scope: string;
            pairingKey: string;
          }): boolean => f.homeId !== f.awayId,
        ),
      );
      const counts = new Map<string, number>();
      for (const f of fixtures)
        counts.set(f.pairingKey, (counts.get(f.pairingKey) || 0) + 1);
      assert.equal(counts.size, (n * (n - 1)) / 2);
      assert([...counts.values()].every((c: number): boolean => c === legs));
      for (const r of new Set(
        fixtures.map(
          (f: {
            homeId: string;
            awayId: string;
            round: number;
            leg: number;
            scope: string;
            pairingKey: string;
          }): number => f.round,
        ),
      )) {
        const ids = fixtures
          .filter(
            (f: {
              homeId: string;
              awayId: string;
              round: number;
              leg: number;
              scope: string;
              pairingKey: string;
            }): boolean => f.round === r,
          )
          .flatMap(
            (f: {
              homeId: string;
              awayId: string;
              round: number;
              leg: number;
              scope: string;
              pairingKey: string;
            }): string[] => [f.homeId, f.awayId],
          );
        assert.equal(new Set(ids).size, ids.length);
      }
    });
test("custom points, arbitrary match order and clearing results", (): void => {
  const t = league(3);
  t.winPoints = 5;
  t.drawPoints = 2;
  t.lossPoints = 1;
  const m = t.matches[2];
  Object.assign(m, validateScore(m, { homeScore: 3, awayScore: 1 }));
  let rows = standings(t, "LEAGUE");
  assert.equal(
    required(rows.find((r: Standing): boolean => r.entrantId === m.homeId))
      .points,
    5,
  );
  assert.equal(
    required(rows.find((r: Standing): boolean => r.entrantId === m.awayId))
      .points,
    1,
  );
  Object.assign(m, validateScore(m, { homeScore: 2, awayScore: 2 }));
  rows = standings(t, "LEAGUE");
  assert.equal(
    required(rows.find((r: Standing): boolean => r.entrantId === m.homeId))
      .points,
    2,
  );
  Object.assign(m, validateScore(m, { homeScore: null, awayScore: null }));
  assert(
    standings(t, "LEAGUE").every(
      (r: Standing): boolean => r.played === 0 && r.points === 0,
    ),
  );
});
test("points, difference, score for determine ranking before manual ties", (): void => {
  const t = league(3);
  for (const m of t.matches)
    Object.assign(
      m,
      validateScore(m, {
        homeScore: m.homeId === "e0" ? 4 : 1,
        awayScore: m.awayId === "e0" ? 4 : 0,
      }),
    );
  assert.equal(standings(t, "LEAGUE")[0].entrantId, "e0");
  assert.equal(completion(t).status, "COMPLETED");
});
test("a championship tie requires an explicit order and becomes stale after correction", (): void => {
  const t = league(2);
  Object.assign(
    t.matches[0],
    validateScore(t.matches[0], { homeScore: 0, awayScore: 0 }),
  );
  assert.equal(completion(t).status, "ACTIVE");
  const signature = required(standings(t, "LEAGUE")[0].tieSignature);
  t.ties = [{ scope: "LEAGUE", signature, order: ["e1", "e0"] }];
  assert.equal(completion(t).championId, "e1");
  Object.assign(
    t.matches[0],
    validateScore(t.matches[0], { homeScore: 1, awayScore: 1 }),
  );
  assert.equal(completion(t).status, "ACTIVE");
});
test("groups qualify different top-N counts and cutoff ties block advancement", (): void => {
  const t = groups();
  assert.throws(
    (): {
      groups: {
        groupId: string;
        name: string;
        entrantIds: string[];
      }[];
      entrantIds: string[];
    } => qualificationPreview(t),
    /Resolve the qualification tie/,
  );
  t.ties = [
    {
      scope: "a",
      signature: required(standings(t, "a")[0].tieSignature),
      order: ["e1", "e0", "e2"],
    },
  ];
  const preview = qualificationPreview(t);
  assert.equal(preview.groups[0].entrantIds.length, 2);
  assert.equal(preview.groups[1].entrantIds.length, 3);
  assert.deepEqual(preview.groups[0].entrantIds, ["e1", "e0"]);
  t.matches[0].homeScore = null;
  t.matches[0].awayScore = null;
  assert.throws(
    (): {
      groups: {
        groupId: string;
        name: string;
        entrantIds: string[];
      }[];
      entrantIds: string[];
    } => qualificationPreview(t),
    /Finish every/,
  );
});
test("invalid groups and duplicated or unassigned entrants cannot start", (): void => {
  const t = groups();
  t.entrants[0].groupId = null;
  assert.throws(
    (): {
      homeId: string;
      awayId: string;
      round: number;
      leg: number;
      scope: string;
      pairingKey: string;
    }[] => previewFixtures(t),
    /Assign every/,
  );
  assert.throws(
    (): {
      homeId: string;
      awayId: string;
      round: number;
      leg: number;
      scope: string;
      pairingKey: string;
    }[] => roundRobin(["same", "same"], 1),
    /Duplicate/,
  );
});
test("six qualifiers need two byes and two matches, then four survivors", (): void => {
  const t = groups();
  t.qualification = {
    entrantIds: t.entrants.map((e: Entrant): string => e.id),
  };
  const eligible = knockoutEligibility(t);
  assert.equal(eligible.byeCount, 2);
  validatePairings(
    eligible,
    [
      ["e2", "e3"],
      ["e4", "e5"],
    ],
    ["e0", "e1"],
  );
  assert.throws(
    (): void =>
      validatePairings(
        eligible,
        [
          ["e2", "e3"],
          ["e2", "e5"],
        ],
        ["e0", "e1"],
      ),
    /exactly once/,
  );
  assert.throws(
    (): void =>
      validatePairings(
        eligible,
        [
          ["e2", "e3"],
          ["e4", "outsider"],
        ],
        ["e0", "e1"],
      ),
    /exactly once/,
  );
  t.rounds = [
    { id: "r1", number: 1, byes: [{ entrantId: "e0" }, { entrantId: "e1" }] },
  ];
  t.matches.push(
    ...[
      ["e2", "e3"],
      ["e4", "e5"],
    ].map(
      (
        p: string[],
        i: number,
      ): {
        id: string;
        stage: "LEAGUE" | "GROUP" | "KNOCKOUT";
        scope: string;
        round: number;
        leg: number;
        homeId: string;
        awayId: string;
        homeScore: number;
        awayScore: number;
        homeTiebreak: null;
        awayTiebreak: null;
        winnerId: string;
        revision: number;
      } => ({
        id: `ko${i}`,
        stage: "KNOCKOUT",
        scope: "KNOCKOUT",
        round: 1,
        leg: 1,
        homeId: p[0],
        awayId: p[1],
        homeScore: 1,
        awayScore: 0,
        homeTiebreak: null,
        awayTiebreak: null,
        winnerId: p[0],
        revision: 0,
      }),
    ),
  );
  const next = knockoutEligibility(t);
  assert.equal(next.entrantIds.length, 4);
  assert.equal(next.byeCount, 0);
});
test("a tied knockout score needs a valid winner; tiebreaks must agree", (): void => {
  const m: Match = { ...league(2).matches[0], stage: "KNOCKOUT" };
  assert.throws(
    ():
      | {
          homeScore: null;
          awayScore: null;
          homeTiebreak: null;
          awayTiebreak: null;
          winnerId: null;
        }
      | {
          homeScore: number;
          awayScore: number | null;
          homeTiebreak: number | null;
          awayTiebreak: number | null;
          winnerId: string | null;
        } => validateScore(m, { homeScore: 1, awayScore: 1 }),
    /Choose a winner/,
  );
  assert.equal(
    validateScore(m, { homeScore: 1, awayScore: 1, winnerId: m.homeId })
      .winnerId,
    m.homeId,
  );
  assert.equal(
    validateScore(m, {
      homeScore: 1,
      awayScore: 1,
      homeTiebreak: 4,
      awayTiebreak: 3,
    }).winnerId,
    m.homeId,
  );
  assert.throws(
    ():
      | {
          homeScore: null;
          awayScore: null;
          homeTiebreak: null;
          awayTiebreak: null;
          winnerId: null;
        }
      | {
          homeScore: number;
          awayScore: number | null;
          homeTiebreak: number | null;
          awayTiebreak: number | null;
          winnerId: string | null;
        } =>
      validateScore(m, {
        homeScore: 1,
        awayScore: 1,
        homeTiebreak: 4,
        awayTiebreak: 3,
        winnerId: m.awayId,
      }),
    /contradicts/,
  );
  assert.throws(
    ():
      | {
          homeScore: null;
          awayScore: null;
          homeTiebreak: null;
          awayTiebreak: null;
          winnerId: null;
        }
      | {
          homeScore: number;
          awayScore: number | null;
          homeTiebreak: number | null;
          awayTiebreak: number | null;
          winnerId: string | null;
        } => validateScore(m, { homeScore: 0.5, awayScore: 1 }),
    /integers/,
  );
  assert.throws(
    ():
      | {
          homeScore: null;
          awayScore: null;
          homeTiebreak: null;
          awayTiebreak: null;
          winnerId: null;
        }
      | {
          homeScore: number;
          awayScore: number | null;
          homeTiebreak: number | null;
          awayTiebreak: number | null;
          winnerId: string | null;
        } => validateScore(m, { homeScore: -1, awayScore: 1 }),
    /integers/,
  );
  assert.throws(
    ():
      | {
          homeScore: null;
          awayScore: null;
          homeTiebreak: null;
          awayTiebreak: null;
          winnerId: null;
        }
      | {
          homeScore: number;
          awayScore: number | null;
          homeTiebreak: number | null;
          awayTiebreak: number | null;
          winnerId: string | null;
        } => validateScore(m, { homeScore: null, awayScore: 1 }),
    /both scores/,
  );
});
test("group correction keeps matching qualifier sets and resets changed/unresolved ones", (): void => {
  const t = groups();
  t.groups[0].qualifierCount = 3;
  t.qualification = qualificationPreview(t);
  t.rounds = [{ id: "r1", number: 1, byes: [] }];
  const m = t.matches[0];
  assert.equal(
    correctionImpact(t, m, validateScore(m, { homeScore: 2, awayScore: 0 }))
      .requiresReset,
    false,
  );
  t.groups[0].qualifierCount = 2;
  t.qualification = { entrantIds: ["e0", "e1", "e3", "e4", "e5"] };
  assert.equal(
    correctionImpact(t, m, validateScore(m, { homeScore: 1, awayScore: 1 }))
      .requiresReset,
    true,
  );
  assert.equal(
    correctionImpact(
      t,
      m,
      validateScore(m, { homeScore: null, awayScore: null }),
    ).resetQualification,
    true,
  );
});
test("knockout winner corrections retain or reset later rounds appropriately", (): void => {
  const t = league(4),
    m: Match = {
      ...t.matches[0],
      stage: "KNOCKOUT",
      scope: "KNOCKOUT",
      round: 1,
      homeScore: 2,
      awayScore: 0,
      winnerId: t.matches[0].homeId,
    };
  t.matches = [m];
  t.rounds = [
    { id: "r1", number: 1, byes: [] },
    { id: "r2", number: 2, byes: [] },
  ];
  assert.equal(
    correctionImpact(t, m, validateScore(m, { homeScore: 3, awayScore: 0 }))
      .requiresReset,
    false,
  );
  assert.deepEqual(
    correctionImpact(t, m, validateScore(m, { homeScore: 0, awayScore: 1 }))
      .roundIds,
    ["r2"],
  );
});
