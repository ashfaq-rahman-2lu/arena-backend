import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPayload } from "../src/tournaments/tournaments.repository";
test("audit views allow only declared competition fields, including nested reset snapshots", (): void => {
  assert.deepEqual(
    auditPayload({
      homeScore: 0,
      awayScore: null,
      rawToken: "secret",
      unexpected: "private",
      matches: [{ id: "match", homeScore: 1, ownerId: "private" }],
    }),
    { homeScore: 0, awayScore: null, matches: [{ id: "match", homeScore: 1 }] },
  );
});
test("audit preserves aggregate tie outcomes while filtering private metadata", (): void => {
  assert.deepEqual(
    auditPayload({
      knockoutTie: {
        id: "tie",
        legs: 2,
        winnerId: "team",
        homeTiebreak: 4,
        awayTiebreak: 3,
        tournamentId: "private",
      },
      knockoutTies: [
        { id: "tie", slot: 0, roundId: "round", ownerId: "private" },
      ],
    }),
    {
      knockoutTie: {
        id: "tie",
        legs: 2,
        winnerId: "team",
        homeTiebreak: 4,
        awayTiebreak: 3,
      },
      knockoutTies: [{ id: "tie", slot: 0, roundId: "round" }],
    },
  );
});
