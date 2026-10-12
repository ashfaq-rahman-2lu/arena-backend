import { ApiExtraModels, ApiProperty, getSchemaPath } from "@nestjs/swagger";
export class UserView {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: Boolean }) hasPassword!: boolean;
  @ApiProperty({ type: Boolean }) googleLinked!: boolean;
}
@ApiExtraModels(UserView)
export class SessionView {
  @ApiProperty({ type: String }) csrf!: string;
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(UserView) },
      { type: "object", nullable: true, enum: [null] },
    ],
  })
  user!: UserView | null;
  @ApiProperty({ type: Boolean }) googleEnabled!: boolean;
}
export class MessageResult {
  @ApiProperty({ type: String }) message!: string;
}
export class SessionCredentialsView {
  @ApiProperty({ type: String }) csrf!: string;
}
