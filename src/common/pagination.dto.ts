import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, TransformFnParams, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
export class PageQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type((): NumberConstructor => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type((): NumberConstructor => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
export class TournamentListQuery extends PageQuery {
  @ApiPropertyOptional({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(0)
  @MaxLength(120)
  @IsOptional()
  search?: string;
  @ApiPropertyOptional({ enum: ["DRAFT", "ACTIVE", "COMPLETED"] })
  @IsIn(["DRAFT", "ACTIVE", "COMPLETED"])
  @IsOptional()
  status?: "DRAFT" | "ACTIVE" | "COMPLETED";
}
