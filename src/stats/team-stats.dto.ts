import { ApiProperty } from "@nestjs/swagger";
import { MatchStat } from "../extraction/extraction.models";
import { TeamStatValue } from "./team-stats.models";

export class MatchStatView implements MatchStat {
  @ApiProperty({
    enum: [
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
    ],
  })
  key!: MatchStat["key"];
  @ApiProperty() label!: string;
  @ApiProperty({ type: Number, nullable: true }) home!: number | null;
  @ApiProperty({ type: Number, nullable: true }) away!: number | null;
  @ApiProperty({ enum: ["percent", "count"] }) unit!: MatchStat["unit"];
}
export class PublicMatchStatsView {
  @ApiProperty({ type: [MatchStatView] }) stats!: MatchStat[];
}

export class TeamStatValueView implements TeamStatValue {
  @ApiProperty({ type: String }) key!: TeamStatValue["key"];
  @ApiProperty({ type: String }) label!: string;
  @ApiProperty({ enum: ["percent", "count"] }) unit!: TeamStatValue["unit"];
  @ApiProperty({ type: Number, nullable: true }) value!: number | null;
  @ApiProperty({ type: Number }) recordedMatches!: number;
  @ApiProperty({ type: Number }) playedMatches!: number;
}
export class TeamStatsRow {
  @ApiProperty({ type: String }) entrantId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: [TeamStatValueView] }) stats!: TeamStatValueView[];
}
export class TeamStatsView {
  @ApiProperty({ type: Boolean }) enabled!: boolean;
  @ApiProperty({ type: [TeamStatsRow] }) teams!: TeamStatsRow[];
}
export class StatUsageView {
  @ApiProperty({ type: Number }) used!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: [String] }) tournamentIds!: string[];
}
export class ArchiveStatsPreviewView {
  @ApiProperty({ type: Number }) tournamentRevision!: number;
  @ApiProperty({ type: Number }) statsMatchCount!: number;
}
