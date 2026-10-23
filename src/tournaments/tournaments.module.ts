import { Module } from "@nestjs/common";
import { TournamentMutationsPort } from "./tournament-mutations.port";
import { TournamentsController } from "./tournaments.controller";
import { TournamentsRepository } from "./tournaments.repository";
import { TournamentsService } from "./tournaments.service";
@Module({
  controllers: [TournamentsController],
  providers: [
    TournamentsService,
    TournamentsRepository,
    { provide: TournamentMutationsPort, useExisting: TournamentsService },
  ],
  exports: [TournamentMutationsPort, TournamentsRepository, TournamentsService],
})
export class TournamentsModule {}
