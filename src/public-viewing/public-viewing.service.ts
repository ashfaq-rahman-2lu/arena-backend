import { Injectable } from "@nestjs/common";
import { PublicViewingRepository } from "./public-viewing.repository";
import { TournamentView } from "../tournaments/tournament-response.dto";
import { TournamentsService } from "../tournaments/tournaments.service";
import { PublicMatchStatsView, TeamStatsView } from "../stats/team-stats.dto";
import { HealthView } from "./health-response.dto";
@Injectable()
export class PublicViewingService {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly repository: PublicViewingRepository,
  ) {}
  async view(publicId: string): Promise<TournamentView> {
    return this.tournaments.publicView(publicId);
  }
  stats(publicId: string): Promise<TeamStatsView> {
    return this.tournaments.publicStats(publicId);
  }
  matchStats(publicId: string, matchId: string): Promise<PublicMatchStatsView> {
    return this.tournaments.publicMatchStats(publicId, matchId);
  }
  async health(): Promise<HealthView> {
    await this.repository.checkDatabase();
    return { status: "ok" };
  }
}
