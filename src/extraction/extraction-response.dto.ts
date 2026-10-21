import { ApiProperty } from "@nestjs/swagger";
export class ObservedSide {
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty({ type: Number, nullable: true }) tiebreak!: number | null;
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
  @ApiProperty({ type: [String] }) warnings!: string[];
}
