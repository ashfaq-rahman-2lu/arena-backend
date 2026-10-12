import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, TransformFnParams } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
export class EmailInput {
  @ApiProperty({ maxLength: 254 })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
export class LoginInput extends EmailInput {
  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}
export class RegistrationInput extends LoginInput {
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}
export class TokenInput {
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
export class ResetInput extends TokenInput {
  @ApiProperty({}) @IsString() @MinLength(10) @MaxLength(128) password!: string;
}
export class GoogleStartQuery {
  @ApiPropertyOptional({ enum: ["1", "0"] })
  @IsOptional()
  @IsIn(["1", "0"])
  link?: string;
}
export class GoogleCallbackQuery {
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  state!: string;
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  code!: string;

  // Google adds these fields to successful authorization callbacks. Identity
  // and account linking still use the verified provider response, not metadata.
  @ApiPropertyOptional({ maxLength: 4096 })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  scope?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  authuser?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  prompt?: string;

  @ApiPropertyOptional({ maxLength: 253 })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  hd?: string;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  iss?: string;
}
