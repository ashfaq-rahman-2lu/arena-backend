export interface FollowedTournament {
  publicId: string;
  name: string;
  game: string;
  format: string;
  status: string;
  createdAt: string;
}
export interface FollowedTournamentPage {
  items: FollowedTournament[];
  total: number;
  page: number;
  limit: number;
}
