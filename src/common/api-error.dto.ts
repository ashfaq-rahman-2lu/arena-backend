import { ApiProperty } from "@nestjs/swagger";
export class ApiError {
  @ApiProperty({ type: Number }) statusCode!: number;
  @ApiProperty({ type: String }) code!: string;
  @ApiProperty({ type: String }) message!: string;
}
