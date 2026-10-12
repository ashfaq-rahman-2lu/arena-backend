import { Module } from "@nestjs/common";
import { TournamentsModule } from "../tournaments/tournaments.module";
import { PublicViewingController } from "./public-viewing.controller";
import { PublicViewingService } from "./public-viewing.service";
import { PublicViewingRepository } from "./public-viewing.repository";
@Module({
  imports: [TournamentsModule],
  controllers: [PublicViewingController],
  providers: [PublicViewingService, PublicViewingRepository],
})
export class PublicViewingModule {}
