import assert from "node:assert/strict";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { TournamentsService } from "../src/tournaments/tournaments.service";
import { TournamentsRepository } from "../src/tournaments/tournaments.repository";
import { TournamentsController } from "../src/tournaments/tournaments.controller";
import { TournamentSetup } from "../src/tournaments/tournament-request.dto";
import { ConfigurationService } from "../src/config/configuration.service";

test("CODM setup cannot reserve a stats slot", async (): Promise<void> => {
  const module = await Test.createTestingModule({
    providers: [
      TournamentsService,
      { provide: TournamentsRepository, useValue: {} },
      { provide: ConfigurationService, useValue: {} },
    ],
  }).compile();
  try {
    const setup = Object.assign(new TournamentSetup(), {
      game: "CODM",
      statsEnabled: true,
      format: "LEAGUE",
      entrants: [],
      groups: [],
      knockoutLegs: 1,
      knockoutFinalLegs: 1,
    });
    assert.throws(
      (): void => module.get(TournamentsService).validateSetup(setup),
      /eFootball/,
    );
  } finally {
    await module.close();
  }
});

test("stats actions explicitly return their documented 200 status", (): void => {
  for (const handler of [
    TournamentsController.prototype.enableStats,
    TournamentsController.prototype.archiveStatsPreview,
    TournamentsController.prototype.archiveStats,
  ]) {
    assert.equal(Reflect.getMetadata(HTTP_CODE_METADATA, handler), 200);
  }
});
