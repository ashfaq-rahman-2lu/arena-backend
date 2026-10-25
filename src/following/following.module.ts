import { Module } from "@nestjs/common";
import { FollowingController } from "./following.controller";
import { FollowingRepository } from "./following.repository";
import { FollowingService } from "./following.service";
@Module({
  controllers: [FollowingController],
  providers: [FollowingRepository, FollowingService],
})
export class FollowingModule {}
