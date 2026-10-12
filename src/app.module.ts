import { DynamicModule, Module } from "@nestjs/common";
import "reflect-metadata";

import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { InfrastructureModule } from "./infrastructure.module";
import { MatchesModule } from "./matches/matches.module";
import { PublicViewingModule } from "./public-viewing/public-viewing.module";
import { TournamentsModule } from "./tournaments/tournaments.module";
@Module({})
export class AppModule {
  static register(environment: Record<string, unknown>): DynamicModule {
    return {
      module: AppModule,
      imports: [
        InfrastructureModule.register(environment),
        DatabaseModule,
        AuthModule,
        TournamentsModule,
        MatchesModule,
        PublicViewingModule,
      ],
    };
  }
}
