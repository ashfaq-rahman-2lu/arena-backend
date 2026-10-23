import { BadRequestException, Controller, Get, Param } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/http-session";
import { TournamentView } from "../tournaments/tournament-response.dto";
import { TeamStatsView } from "../stats/team-stats.dto";
import { HealthView } from "./health-response.dto";
import { PublicViewingService } from "./public-viewing.service";
@ApiTags("public")
@Public()
@Controller()
export class PublicViewingController {
  constructor(private readonly viewing: PublicViewingService) {}
  @Get("public/tournaments/:publicId/stats")
  @ApiOkResponse({ type: TeamStatsView })
  stats(@Param("publicId") publicId: string): Promise<TeamStatsView> {
    if (!/^[A-Z0-9]{8,10}$/i.test(publicId))
      throw new BadRequestException("Enter a valid public tournament ID");
    return this.viewing.stats(publicId);
  }
  @Get("public/tournaments/:publicId")
  @ApiOkResponse({ type: TournamentView })
  view(@Param("publicId") publicId: string): Promise<TournamentView> {
    if (!/^[A-Z0-9]{8,10}$/i.test(publicId))
      throw new BadRequestException("Enter a valid public tournament ID");
    return this.viewing.view(publicId);
  }
  @Get("health")
  @ApiOkResponse({ type: HealthView })
  health(): Promise<HealthView> {
    return this.viewing.health();
  }
}
