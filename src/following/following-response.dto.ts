import { ApiProperty } from "@nestjs/swagger";
export class FollowedTournamentView {
  @ApiProperty({ type: String }) publicId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) game!: string;
  @ApiProperty({ type: String }) format!: string;
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: String }) createdAt!: string;
}
export class FollowedTournamentPageView {
  @ApiProperty({ type: [FollowedTournamentView] })
  items!: FollowedTournamentView[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) limit!: number;
}
export class FollowStatusView {
  @ApiProperty({ type: Boolean }) following!: boolean;
}
