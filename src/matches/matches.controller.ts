import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { actor, AuthedRequest } from "../auth/http-session";
import { ExtractionSuggestion } from "../extraction/extraction-response.dto";
import { TournamentView } from "../tournaments/tournament-response.dto";
import { CorrectionImpact } from "./match-response.dto";
import { MatchesService } from "./matches.service";
import { ResultInput } from "./result-request.dto";
@ApiTags("matches")
@ApiCookieAuth()
@ApiSecurity("csrf")
@Controller("matches")
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}
  @Post(":matchId/correction-preview")
  @ApiCreatedResponse({ type: CorrectionImpact })
  preview(
    @Req() request: AuthedRequest,
    @Param("matchId", new ParseUUIDPipe()) id: string,
    @Body() input: ResultInput,
  ): Promise<CorrectionImpact> {
    return this.matches.preview(id, actor(request), input);
  }
  @Patch(":matchId/result") @ApiOkResponse({ type: TournamentView }) save(
    @Req() request: AuthedRequest,
    @Param("matchId", new ParseUUIDPipe()) id: string,
    @Body() input: ResultInput,
  ): Promise<TournamentView> {
    return this.matches.save(id, actor(request), input);
  }
  @Post(":matchId/extract-score")
  @ApiOperation({
    summary: "Extract scores and match stats for an eFootball tournament",
    description:
      "Only available when the match belongs to an EFOOTBALL tournament. Other games return 400 RULE_VIOLATION; manual result entry remains available.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { image: { type: "string", format: "binary" } },
      required: ["image"],
      additionalProperties: false,
    },
  })
  @ApiCreatedResponse({ type: ExtractionSuggestion })
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  extract(
    @Req() request: AuthedRequest,
    @Param("matchId", new ParseUUIDPipe()) id: string,
    @UploadedFile() image: Express.Multer.File | undefined,
  ): Promise<ExtractionSuggestion> {
    return this.matches.extract(id, actor(request), image);
  }
}
