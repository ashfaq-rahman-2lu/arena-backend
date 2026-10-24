import { Inject, Injectable } from "@nestjs/common";
import { ApplicationError } from "../common/application-error";
import { ExtractionSuggestion } from "../extraction/extraction-response.dto";
import { ExtractionService } from "../extraction/extraction.service";
import { ExtractionMode } from "../extraction/extraction.models";
import { TournamentMutationsPort } from "../tournaments/tournament-mutations.port";
import { TournamentView } from "../tournaments/tournament-response.dto";
import { CorrectionImpact } from "./match-response.dto";
import { ResultInput } from "./result-request.dto";
@Injectable()
export class MatchesService {
  constructor(
    @Inject(TournamentMutationsPort)
    private readonly tournaments: TournamentMutationsPort,
    private readonly extraction: ExtractionService,
  ) {}
  preview(
    id: string,
    userId: string,
    input: ResultInput,
  ): Promise<CorrectionImpact> {
    return this.tournaments.previewResult(id, userId, input);
  }
  save(
    id: string,
    userId: string,
    input: ResultInput,
  ): Promise<TournamentView> {
    return this.tournaments.result(id, userId, input);
  }
  async extract(
    id: string,
    userId: string,
    image: Express.Multer.File | undefined,
  ): Promise<ExtractionSuggestion> {
    const { m, t } = await this.tournaments.ownerMatch(id, userId);
    if (t.game !== "EFOOTBALL")
      throw new ApplicationError(
        "RULE_VIOLATION",
        400,
        "Scorecard upload is only available for eFootball tournaments.",
      );
    const home = t.entrants.find(
        (e: (typeof t.entrants)[number]): boolean => e.id === m.homeId,
      ),
      away = t.entrants.find(
        (e: (typeof t.entrants)[number]): boolean => e.id === m.awayId,
      );
    if (!home || !away)
      throw new ApplicationError("NOT_FOUND", 404, "Match entrants not found");
    const mode: ExtractionMode = t.statsEnabled ? "full" : "scores";
    return this.extraction.read(image, [home, away], mode);
  }
}
