import { Module } from "@nestjs/common";
import { ExtractionModule } from "../extraction/extraction.module";
import { TournamentsModule } from "../tournaments/tournaments.module";
import { MatchesController } from "./matches.controller";
import { MatchesService } from "./matches.service";
@Module({
  imports: [TournamentsModule, ExtractionModule],
  controllers: [MatchesController],
  providers: [MatchesService],
})
export class MatchesModule {}
