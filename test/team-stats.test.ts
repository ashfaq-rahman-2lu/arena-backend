import assert from "node:assert/strict";
import test from "node:test";
import { MatchStat } from "../src/extraction/extraction.models";
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
            key: "shotsOnTarget",
            label: "Shots on target",
            unit: "count",
            home: 5,
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
            key: "shotsOnTarget",
            label: "Shots on target",
            unit: "count",
            home: 8,
            away: 6,
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

test("paired shot and pass totals use only matches with both values recorded", (): void => {
  const result = aggregateTeamStats(
    [
      {
        side: "home",
        stats: [
          { key: "shots", label: "Shots", unit: "count", home: 11, away: null },
          {
            key: "shotsOnTarget",
            label: "Shots on target",
            unit: "count",
            home: 9,
            away: null,
          },
          {
            key: "passes",
            label: "Passes",
            unit: "count",
            home: 79,
            away: null,
          },
          {
            key: "successfulPasses",
            label: "Successful passes",
            unit: "count",
            home: 57,
            away: null,
          },
        ],
      },
      {
        side: "home",
        stats: [
          { key: "shots", label: "Shots", unit: "count", home: 7, away: null },
          {
            key: "shotsOnTarget",
            label: "Shots on target",
            unit: "count",
            home: null,
            away: null,
          },
          {
            key: "passes",
            label: "Passes",
            unit: "count",
            home: 109,
            away: null,
          },
          {
            key: "successfulPasses",
            label: "Successful passes",
            unit: "count",
            home: 0,
            away: null,
          },
        ],
      },
      {
        side: "home",
        stats: [
          { key: "shots", label: "Shots", unit: "count", home: 5, away: null },
          {
            key: "shotsOnTarget",
            label: "Shots on target",
            unit: "count",
            home: 2,
            away: null,
          },
          {
            key: "passes",
            label: "Passes",
            unit: "count",
            home: 100,
            away: null,
          },
          {
            key: "successfulPasses",
            label: "Successful passes",
            unit: "count",
            home: null,
            away: null,
          },
        ],
      },
    ],
    3,
  );

  const statValue = (key: MatchStat["key"]): TeamStatValue | undefined =>
    result.find((stat: TeamStatValue): boolean => stat.key === key);

  assert.equal(statValue("shots")?.value, 16);
  assert.equal(statValue("shots")?.recordedMatches, 2);
  assert.equal(statValue("shotsOnTarget")?.value, 11);
  assert.equal(statValue("shotsOnTarget")?.recordedMatches, 2);
  assert.equal(statValue("passes")?.value, 188);
  assert.equal(statValue("passes")?.recordedMatches, 2);
  assert.equal(statValue("successfulPasses")?.value, 57);
  assert.equal(statValue("successfulPasses")?.recordedMatches, 2);
});
