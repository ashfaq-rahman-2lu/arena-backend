import { ApiProperty } from "@nestjs/swagger";
export class HealthView {
  @ApiProperty({ type: String }) status!: string;
}
