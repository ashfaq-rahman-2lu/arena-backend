import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, TransformFnParams } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
@ValidatorConstraint({ name: "exactlyOneOAuthResult", async: false })
class ExactlyOneOAuthResult implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const value: unknown = args.object;
    if (!value || typeof value !== "object") return false;
    const code: unknown = Reflect.get(value, "code");
    const error: unknown = Reflect.get(value, "error");
    return (typeof code === "string") !== (typeof error === "string");
  }
  defaultMessage(): string {
    return "Provide exactly one of code or error";
  }
}
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
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
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
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
export class ProfileUpdateInput {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}
export class PasswordChangeInput {
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
export class EmailChangeInput extends EmailInput {
  @ApiPropertyOptional({ minLength: 8, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword?: string;
}
export class GoogleStartQuery {
  @ApiPropertyOptional({ enum: ["1", "0"] })
  @IsOptional()
  @IsIn(["1", "0"])
  link?: string;
  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  returnTo?: string;
}
export class GoogleCallbackQuery {
  @ApiProperty({})
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  @Validate(ExactlyOneOAuthResult)
  state!: string;
  @ApiPropertyOptional({ maxLength: 4096 })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  code!: string;
  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  error?: string;

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
