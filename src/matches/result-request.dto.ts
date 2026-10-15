import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
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
