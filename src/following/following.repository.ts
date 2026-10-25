import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ApplicationError } from "../common/application-error";
import { FollowedTournament, FollowedTournamentPage } from "./following.models";
@Injectable()
export class FollowingRepository {
  constructor(private readonly db: DatabaseService) {}
  async list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<FollowedTournamentPage> {
    const where = { userId };
    const [rows, total] = await this.db.$transaction([
      this.db.tournamentFollow.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { tournamentId: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          createdAt: true,
          tournament: {
            select: {
              publicId: true,
              name: true,
              game: true,
              format: true,
              status: true,
            },
          },
        },
      }),
      this.db.tournamentFollow.count({ where }),
    ]);
    return {
      items: rows.map(
        (row: {
          createdAt: Date;
          tournament: {
            publicId: string;
            name: string;
            game: string;
            format: string;
            status: string;
          };
        }): FollowedTournament => ({
          ...row.tournament,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      total,
      page,
      limit,
    };
  }
  async following(userId: string, publicId: string): Promise<boolean> {
    return Boolean(
      await this.db.tournamentFollow.findFirst({
        where: { userId, tournament: { publicId: publicId.toUpperCase() } },
        select: { id: true },
      }),
    );
  }
  async follow(userId: string, publicId: string): Promise<void> {
    const tournament = await this.db.tournament.findUnique({
      where: { publicId: publicId.toUpperCase() },
      select: { id: true },
    });
    if (!tournament)
      throw new ApplicationError("NOT_FOUND", 404, "Tournament not found");
    await this.db.tournamentFollow.upsert({
      where: { userId_tournamentId: { userId, tournamentId: tournament.id } },
      create: { userId, tournamentId: tournament.id },
      update: {},
    });
  }
  async unfollow(userId: string, publicId: string): Promise<void> {
    await this.db.tournamentFollow.deleteMany({
      where: { userId, tournament: { publicId: publicId.toUpperCase() } },
    });
  }
  async exists(publicId: string): Promise<boolean> {
    return Boolean(
      await this.db.tournament.findUnique({
        where: { publicId: publicId.toUpperCase() },
        select: { id: true },
      }),
    );
  }
}
