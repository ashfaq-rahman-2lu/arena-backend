import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
export class ObservedSide {
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty({ type: Number, nullable: true }) tiebreak!: number | null;
}
export class ExtractedMatchStat {
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
  key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 9999 })
  home!: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 9999 })
  away!: number | null;
  @ApiProperty({ enum: ["percent", "count"] }) unit!: "percent" | "count";
}
export class ExtractionSuggestion {
  @ApiProperty({
    type: Boolean,
    description:
      "Scores are assigned by template position: left is home, right is away. No team-name matching is performed.",
  })
  matched!: boolean;
  @ApiProperty({ type: [ObservedSide] }) observedSides!: ObservedSide[];
  @ApiProperty({ type: Number, nullable: true }) homeScore!: number | null;
  @ApiProperty({ type: Number, nullable: true }) awayScore!: number | null;
  @ApiProperty({ type: Number, nullable: true }) homeTiebreak!: number | null;
  @ApiProperty({ type: Number, nullable: true }) awayTiebreak!: number | null;
  @ApiPropertyOptional({
    type: [ExtractedMatchStat],
    description:
      "All thirteen match stat rows when tournament stat recording is enabled; empty array when disabled. Unreadable cells are null. Suggestions only.",
  })
  stats?: ExtractedMatchStat[];
  @ApiProperty({ type: [String] }) warnings!: string[];
}
