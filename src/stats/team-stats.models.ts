import { MatchStat } from "../extraction/extraction.models";

export interface TeamStatValue {
  key: MatchStat["key"];
  label: string;
  unit: MatchStat["unit"];
  value: number | null;
  recordedMatches: number;
  playedMatches: number;
}

export interface TeamStatMatch {
  stats: MatchStat[];
  side: "home" | "away";
}

const statLabels: Record<MatchStat["key"], string> = {
  possession: "Possession",
  shots: "Shots",
  shotsOnTarget: "Shots on target",
  fouls: "Fouls",
  offsides: "Offsides",
  cornerKicks: "Corner kicks",
  freeKicks: "Free kicks",
  passes: "Passes",
  successfulPasses: "Successful passes",
  crosses: "Crosses",
  interceptions: "Interceptions",
  tackles: "Tackles",
  saves: "Saves",
};

export function aggregateTeamStats(
  matches: TeamStatMatch[],
  playedMatches: number,
): TeamStatValue[] {
  const keys: MatchStat["key"][] = [
    "possession",
    "shots",
    "shotsOnTarget",
    "fouls",
    "offsides",
    "cornerKicks",
    "freeKicks",
    "passes",
    "successfulPasses",
    "crosses",
    "interceptions",
    "tackles",
    "saves",
  ];
  return keys.map((key: MatchStat["key"]): TeamStatValue => {
    const values: number[] = matches.flatMap(
      (match: TeamStatMatch): number[] => {
        const value = match.stats.find(
          (stat: MatchStat): boolean => stat.key === key,
        )?.[match.side];
        return value === null || value === undefined ? [] : [value];
      },
    );
    const unit: MatchStat["unit"] = key === "possession" ? "percent" : "count";
    return {
      key,
      label: statLabels[key],
      unit,
      value:
        values.length === 0
          ? null
          : unit === "percent"
            ? Math.round(
                (values.reduce(
                  (sum: number, value: number): number => sum + value,
                  0,
                ) /
                  values.length) *
                  10,
              ) / 10
            : values.reduce(
                (sum: number, value: number): number => sum + value,
                0,
              ),
      recordedMatches: values.length,
      playedMatches,
    };
  });
}

export interface StatMatchRecord {
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  stats: MatchStat[] | null;
}
export interface TournamentStatSource {
  statsEnabled: boolean;
  entrants: { id: string; name: string }[];
  matches: StatMatchRecord[];
}
