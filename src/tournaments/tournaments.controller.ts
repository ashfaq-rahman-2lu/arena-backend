import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { actor, AuthedRequest } from "../auth/http-session";
import { PageQuery, TournamentListQuery } from "../common/pagination.dto";
import {
  EntrantUpdate,
  EntrantsAddition,
  TournamentNameUpdate,
  DrawInput,
  PairingInput,
  RevisionInput,
  TieInput,
  TournamentSetup,
  TournamentUpdate,
} from "./tournament-request.dto";
import {
  DrawPreview,
  EntrantPage,
  FixturePage,
  HistoryPage,
  TournamentPage,
  TournamentView,
} from "./tournament-response.dto";
import { TournamentsService } from "./tournaments.service";
@ApiTags("tournaments")
@ApiCookieAuth()
@ApiSecurity("csrf")
@Controller("tournaments")
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}
  @Get()
  @ApiOkResponse({ type: TournamentPage })
  list(
    @Req()
    req: AuthedRequest,
    @Query()
    query: TournamentListQuery,
  ): Promise<TournamentPage> {
    return this.tournaments.list(actor(req), query);
  }
  @Post()
  @ApiCreatedResponse({ type: TournamentView })
  create(
    @Req()
    req: AuthedRequest,
    @Body()
    body: TournamentSetup,
  ): Promise<TournamentView> {
    return this.tournaments.create(actor(req), body);
  }
  @Get(":id")
  @ApiOkResponse({ type: TournamentView })
  async get(
    @Req()
    req: AuthedRequest,
    @Param("id", new ParseUUIDPipe())
    id: string,
  ): Promise<TournamentView> {
    return this.tournaments.view(await this.tournaments.owned(id, actor(req)));
  }
  @Patch(":id")
  @ApiOkResponse({ type: TournamentView })
  update(
    @Req()
    req: AuthedRequest,
    @Param("id", new ParseUUIDPipe())
    id: string,
    @Body()
    body: TournamentUpdate,
  ): Promise<TournamentView> {
    return this.tournaments.update(id, actor(req), body);
  }
  @Patch(":id/name")
  @ApiOkResponse({ type: TournamentView })
  renameTournament(
    @Req() req: AuthedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: TournamentNameUpdate,
  ): Promise<TournamentView> {
    return this.tournaments.renameTournament(id, actor(req), body);
  }
  @Get(":id/entrants")
  @ApiOkResponse({ type: EntrantPage })
  entrants(
    @Req() req: AuthedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: PageQuery,
  ): Promise<EntrantPage> {
    return this.tournaments.entrants(id, actor(req), query);
  }
  @Post(":id/entrants")
  @ApiCreatedResponse({ type: TournamentView })
  addEntrants(
    @Req() req: AuthedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: EntrantsAddition,
  ): Promise<TournamentView> {
    return this.tournaments.addEntrants(id, actor(req), body);
  }
  @Post(":id/rounds/draw-preview")
  @ApiCreatedResponse({ type: DrawPreview })
  draw(
    @Req() req: AuthedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: DrawInput,
  ): Promise<DrawPreview> {
    return this.tournaments.draw(id, actor(req), body);
  }
  @Get(":id/fixture-preview")
  @ApiOkResponse({ type: FixturePage })
  preview(
    @Req()
    req: AuthedRequest,
    @Param("id", new ParseUUIDPipe())
    id: string,
    @Query()
    query: PageQuery,
  ): Promise<FixturePage> {
    return this.tournaments.preview(id, actor(req), query);
  }
  @Post(":id/start")
  @ApiCreatedResponse({ type: TournamentView })
  start(
    @Req()
    req: AuthedRequest,
    @Param("id", new ParseUUIDPipe())
    id: string,
    @Body()
    body: RevisionInput,
  ): Promise<TournamentView> {
    return this.tournaments.start(id, actor(req), body.expectedRevision);
  }
  @Patch(":id/entrants/:entrantId")
  @ApiOkResponse({ type: TournamentView })
  rename(
    @Req()
    req: AuthedRequest,
    @Param("id", new ParseUUIDPipe())
    id: string,
    @Param("entrantId", new ParseUUIDPipe())
    entrantId: string,
    @Body()
    body: EntrantUpdate,
  ): Promise<TournamentView> {
    return this.tournaments.rename(id, entrantId, actor(req), body);
  }
  @Post(":id/ties")
  @ApiCreatedResponse({ type: TournamentView })
  ties(
    @Req()
    req: AuthedRequest,
    @Param("id", new ParseUUIDPipe())
    id: string,
    @Body()
    body: TieInput,
  ): Promise<TournamentView> {
    return this.tournaments.resolveTie(id, actor(req), body);
  }
  @Post(":id/qualification")
  @ApiCreatedResponse({ type: TournamentView })
  qualification(
    @Req()
    req: AuthedRequest,
    @Param("id", new ParseUUIDPipe())
    id: string,
    @Body()
    body: RevisionInput,
  ): Promise<TournamentView> {
    return this.tournaments.qualify(id, actor(req), body.expectedRevision);
  }
  @Post(":id/rounds")
  @ApiCreatedResponse({ type: TournamentView })
  pairs(
    @Req()
    req: AuthedRequest,
    @Param("id", new ParseUUIDPipe())
    id: string,
    @Body()
    body: PairingInput,
  ): Promise<TournamentView> {
    return this.tournaments.pair(id, actor(req), body);
  }
  @Get(":id/history")
  @ApiOkResponse({ type: HistoryPage })
  history(
    @Req()
    req: AuthedRequest,
    @Param("id", new ParseUUIDPipe())
    id: string,
    @Query()
    query: PageQuery,
  ): Promise<HistoryPage> {
    return this.tournaments.history(id, actor(req), query);
  }
}
