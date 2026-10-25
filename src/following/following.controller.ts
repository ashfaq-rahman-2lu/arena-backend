import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { ApplicationError } from "../common/application-error";
import { actor, AuthedRequest } from "../auth/http-session";
import { PageQuery } from "../common/pagination.dto";
import { FollowingService } from "./following.service";
import {
  FollowedTournamentPageView,
  FollowStatusView,
} from "./following-response.dto";
@ApiTags("following")
@Controller("following")
export class FollowingController {
  constructor(private readonly following: FollowingService) {}
  @ApiSecurity("cookie")
  @Get()
  @ApiOkResponse({ type: FollowedTournamentPageView })
  list(
    @Req() request: AuthedRequest,
    @Query() query: PageQuery,
  ): Promise<FollowedTournamentPageView> {
    return this.following.list(actor(request), query.page, query.limit);
  }
  @ApiSecurity("cookie")
  @Get(":publicId")
  @ApiOkResponse({ type: FollowStatusView })
  async status(
    @Req() request: AuthedRequest,
    @Param("publicId") publicId: string,
  ): Promise<FollowStatusView> {
    this.validatePublicId(publicId);
    return { following: await this.following.status(actor(request), publicId) };
  }
  @ApiSecurity({ cookie: [], csrf: [] })
  @Put(":publicId")
  @HttpCode(204)
  @ApiNoContentResponse()
  async follow(
    @Req() request: AuthedRequest,
    @Param("publicId") publicId: string,
  ): Promise<void> {
    this.validatePublicId(publicId);
    await this.following.follow(actor(request), publicId);
  }
  @ApiSecurity({ cookie: [], csrf: [] })
  @Delete(":publicId")
  @HttpCode(204)
  @ApiNoContentResponse()
  async unfollow(
    @Req() request: AuthedRequest,
    @Param("publicId") publicId: string,
  ): Promise<void> {
    this.validatePublicId(publicId);
    await this.following.unfollow(actor(request), publicId);
  }
  private validatePublicId(publicId: string): void {
    if (!/^[A-Z0-9]{8,10}$/i.test(publicId))
      throw new ApplicationError(
        "RULE_VIOLATION",
        400,
        "Enter a valid public tournament ID",
      );
  }
}
