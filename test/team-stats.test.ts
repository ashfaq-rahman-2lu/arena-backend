import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateTeamStats,
  TeamStatValue,
} from "../src/stats/team-stats.models";

test("team stats sum counts, average possession, and report coverage", (): void => {
  const result = aggregateTeamStats(
    [
      {
        side: "home",
        stats: [
          {
            key: "shots",
            label: "Shots",
            unit: "count",
            home: 10,
            away: null,
          },
          {
            key: "possession",
            label: "Possession",
            unit: "percent",
            home: 60,
            away: 40,
          },
        ],
      },
      {
        side: "away",
        stats: [
          {
            key: "shots",
            label: "Shots",
            unit: "count",
            home: 10,
            away: 20,
          },
          {
            key: "possession",
            label: "Possession",
            unit: "percent",
            home: 60,
            away: 40,
          },
        ],
      },
    ],
    3,
  );
  assert.equal(
    result.find((stat: TeamStatValue): boolean => stat.key === "shots")?.value,
    30,
  );
  assert.equal(
    result.find((stat: TeamStatValue): boolean => stat.key === "shots")
      ?.recordedMatches,
    2,
  );
  assert.equal(
    result.find((stat: TeamStatValue): boolean => stat.key === "shots")
      ?.playedMatches,
    3,
  );
  assert.equal(
    result.find((stat: TeamStatValue): boolean => stat.key === "possession")
      ?.value,
    50,
  );
});
