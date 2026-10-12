import { CorrectionImpact } from "../matches/match-response.dto";
import { ResultInput } from "../matches/result-request.dto";
import { TournamentView } from "./tournament-response.dto";
import { OwnedMatch } from "./tournament.models";
export abstract class TournamentMutationsPort {
  abstract ownerMatch(matchId: string, userId: string): Promise<OwnedMatch>;
  abstract previewResult(
    matchId: string,
    userId: string,
    input: ResultInput,
  ): Promise<CorrectionImpact>;
  abstract result(
    matchId: string,
    userId: string,
    input: ResultInput,
  ): Promise<TournamentView>;
}
