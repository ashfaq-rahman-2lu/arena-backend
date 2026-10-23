import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, TransformFnParams, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  isUUID,
} from "class-validator";
export class EntrantSetup {
  @ApiPropertyOptional({}) @IsOptional() @IsUUID() id?: string;
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
  @ApiProperty({ type: [String], maxItems: 10 })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  aliases: string[] = [];
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(127)
  groupIndex?: number | null;
}
export class GroupSetup {
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
  @ApiProperty({}) @IsInt() @Min(1) @Max(256) qualifierCount!: number;
}
export class TournamentSetup {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  statsEnabled?: boolean;
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
  @ApiProperty({ enum: ["EFOOTBALL", "CODM"] })
  @IsIn(["EFOOTBALL", "CODM"])
  game!: "EFOOTBALL" | "CODM";
  @ApiProperty({ enum: ["LEAGUE", "WORLD_CUP", "KNOCKOUT"] })
  @IsIn(["LEAGUE", "WORLD_CUP", "KNOCKOUT"])
  format!: "LEAGUE" | "WORLD_CUP" | "KNOCKOUT";
  @ApiPropertyOptional({ enum: [1, 2], default: 1 })
  @IsIn([1, 2])
  knockoutLegs: 1 | 2 = 1;
  @ApiPropertyOptional({ enum: [1, 2], default: 1 })
  @IsIn([1, 2])
  knockoutFinalLegs: 1 | 2 = 1;
  @ApiProperty({ enum: [1, 2] }) @IsIn([1, 2]) legs!: 1 | 2;
  @ApiProperty({}) @IsInt() @Min(0) @Max(1000) winPoints!: number;
  @ApiProperty({}) @IsInt() @Min(0) @Max(1000) drawPoints!: number;
  @ApiProperty({}) @IsInt() @Min(0) @Max(1000) lossPoints!: number;
  @ApiProperty({ type: [EntrantSetup], minItems: 2, maxItems: 256 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type((): typeof EntrantSetup => EntrantSetup)
  entrants!: EntrantSetup[];
  @ApiProperty({ type: [GroupSetup], maxItems: 128 })
  @IsArray()
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type((): typeof GroupSetup => GroupSetup)
  groups: GroupSetup[] = [];
}
export class RevisionInput {
  @ApiProperty({}) @IsInt() @Min(0) @Max(2147483647) expectedRevision!: number;
}
export class ArchiveStatsInput extends RevisionInput {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(0)
  @Max(1000000)
  statsMatchCount!: number;
}
export class TournamentUpdate extends TournamentSetup {
  @ApiProperty({}) @IsInt() @Min(0) @Max(2147483647) expectedRevision!: number;
}
export class EntrantUpdate extends RevisionInput {
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  aliases!: string[];
}
export class TieInput extends RevisionInput {
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  scope!: string;
  @ApiProperty({}) @Matches(/^[a-f0-9]{64}$/) signature!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(256)
  @IsUUID(undefined, { each: true })
  order!: string[];
}
@ValidatorConstraint({ name: "pairs", async: false })
export class PairListValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.length <= 128 &&
      value.every(
        (pair: unknown): boolean =>
          Array.isArray(pair) &&
          pair.length === 2 &&
          pair.every(
            (id: unknown): boolean => typeof id === "string" && isUUID(id),
          ),
      )
    );
  }
  defaultMessage(): string {
    return "pairs must contain at most 128 pairs of UUIDs";
  }
}
export class PairingInput extends RevisionInput {
  @ApiPropertyOptional({
    enum: ["MANUAL", "RANDOM", "FIXED"],
    default: "MANUAL",
  })
  @IsIn(["MANUAL", "RANDOM", "FIXED"])
  method: "MANUAL" | "RANDOM" | "FIXED" = "MANUAL";
  @ApiPropertyOptional({})
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  drawToken?: string;
  @ApiPropertyOptional({ type: (): [typeof BracketSlot] => [BracketSlot] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type((): typeof BracketSlot => BracketSlot)
  slots?: BracketSlot[];

  @ApiProperty({
    type: "array",
    maxItems: 128,
    items: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: { type: "string", format: "uuid" },
    },
  })
  @Validate(PairListValidator)
  pairs!: [string, string][];
  @ApiProperty({ type: [String], maxItems: 256 })
  @IsArray()
  @ArrayMaxSize(256)
  @IsUUID(undefined, { each: true })
  byes!: string[];
}

export class TournamentNameUpdate extends RevisionInput {
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
export class NewEntrant {
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  aliases: string[] = [];
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;
}
export class EntrantsAddition extends RevisionInput {
  @ApiProperty({ type: [NewEntrant] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(254)
  @ValidateNested({ each: true })
  @Type((): typeof NewEntrant => NewEntrant)
  entrants!: NewEntrant[];
}
export class DrawInput extends RevisionInput {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(256)
  @IsUUID(undefined, { each: true })
  byes!: string[];
}
export class BracketSlot {
  @ApiProperty({ enum: ["PAIR", "BYE"] }) @IsIn(["PAIR", "BYE"]) kind!:
    "PAIR" | "BYE";
  @ApiProperty({}) @IsInt() @Min(0) @Max(255) index!: number;
}
