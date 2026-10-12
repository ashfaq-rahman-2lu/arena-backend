import { ApiProperty } from "@nestjs/swagger";
export class CorrectionImpact {
  @ApiProperty({ type: Boolean }) requiresReset!: boolean;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: [String] }) roundIds!: string[];
  @ApiProperty({ type: [String] }) matchIds!: string[];
  @ApiProperty({ type: Boolean }) resetQualification!: boolean;
  @ApiProperty({ type: String }) impactToken!: string;
  @ApiProperty({ type: Number }) tournamentRevision!: number;
}
