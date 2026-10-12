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
