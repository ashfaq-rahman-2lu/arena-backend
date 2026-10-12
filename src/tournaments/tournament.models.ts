import { Competition, Match } from "../domain/engine";
export interface TournamentAggregate extends Competition {
  ownerId: string;
}
export interface OwnedMatch {
  m: Match;
  t: TournamentAggregate;
}
