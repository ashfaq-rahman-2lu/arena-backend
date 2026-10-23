import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsArray,
  ArrayMaxSize,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";
import { RevisionInput } from "../tournaments/tournament-request.dto";
import { MatchStat } from "../extraction/extraction.models";
export class MatchStatInput {
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
  @IsIn([
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
  ])
  key!: MatchStat["key"];
  @ApiProperty({ type: String, maxLength: 50 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label!: string;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  home?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  away?: number | null;
  @ApiProperty({ enum: ["percent", "count"] })
  @IsIn(["percent", "count"])
  unit!: "percent" | "count";
}
export class KnockoutDecision {
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  homeTiebreak?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  awayTiebreak?: number | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  winnerId?: string | null;
}
export class ResultInput extends RevisionInput {
  @ApiPropertyOptional({ type: [MatchStatInput], maxItems: 13, nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(13)
  @ValidateNested({ each: true })
  @Type((): typeof MatchStatInput => MatchStatInput)
  stats?: MatchStatInput[] | null;
  @ApiPropertyOptional({ type: KnockoutDecision })
  @IsOptional()
  @ValidateNested()
  @Type((): typeof KnockoutDecision => KnockoutDecision)
  knockoutDecision?: KnockoutDecision;

  @ApiProperty({})
  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedTournamentRevision!: number;
  @ApiProperty({ type: Number, nullable: true })
  @ValidateIf((_object: object, value: unknown): boolean => value !== null)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  homeScore!: number | null;
  @ApiProperty({ type: Number, nullable: true })
  @ValidateIf((_object: object, value: unknown): boolean => value !== null)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  awayScore!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @ValidateIf(
    (_object: object, value: unknown): boolean =>
      value !== null && value !== undefined,
  )
  @IsInt()
  @Min(0)
  @Max(2147483647)
  homeTiebreak?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @ValidateIf(
    (_object: object, value: unknown): boolean =>
      value !== null && value !== undefined,
  )
  @IsInt()
  @Min(0)
  @Max(2147483647)
  awayTiebreak?: number | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  winnerId?: string | null;
  @ApiPropertyOptional({})
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  impactToken?: string;
  @ApiPropertyOptional({}) @IsOptional() @IsBoolean() confirmReset?: boolean;
}
