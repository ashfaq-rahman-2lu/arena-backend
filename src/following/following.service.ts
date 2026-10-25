import { Injectable } from "@nestjs/common";
import { ApplicationError } from "../common/application-error";
import { FollowedTournamentPage } from "./following.models";
import { FollowingRepository } from "./following.repository";
@Injectable()
export class FollowingService {
  constructor(private readonly repository: FollowingRepository) {}
  list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<FollowedTournamentPage> {
    return this.repository.list(userId, page, limit);
  }
  status(userId: string, publicId: string): Promise<boolean> {
    return this.repository.following(userId, publicId);
  }
  async follow(userId: string, publicId: string): Promise<void> {
    if (!(await this.repository.exists(publicId)))
      throw new ApplicationError("NOT_FOUND", 404, "Tournament not found");
    await this.repository.follow(userId, publicId);
  }
  unfollow(userId: string, publicId: string): Promise<void> {
    return this.repository.unfollow(userId, publicId);
  }
}
