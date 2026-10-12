import { Injectable } from "@nestjs/common";
import { PublicViewingRepository } from "./public-viewing.repository";
import { tournamentView } from "../domain/engine";
import { TournamentView } from "../tournaments/tournament-response.dto";
import { TournamentsRepository } from "../tournaments/tournaments.repository";
import { HealthView } from "./health-response.dto";
@Injectable()
export class PublicViewingService {
  constructor(
    private readonly tournaments: TournamentsRepository,
    private readonly repository: PublicViewingRepository,
  ) {}
  async view(publicId: string): Promise<TournamentView> {
    const { ownerId, ...competition } =
      await this.tournaments.publicView(publicId);
    return tournamentView(competition);
  }
  async health(): Promise<HealthView> {
    await this.repository.checkDatabase();
    return { status: "ok" };
  }
}
