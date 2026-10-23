import {
  Game,
  CompetitionFormat,
  CompetitionStatus,
  MatchStage,
  CompetitionStage,
  AuditAction,
  games,
  formats,
  statuses,
  matchStages,
  competitionStages,
} from "../domain/competition-values";
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import {
  ArchiveStatsPreviewView,
  StatUsageView,
} from "../stats/team-stats.dto";
import { MatchStatInput } from "../matches/result-request.dto";
export class Entrant {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: [String] }) aliases!: string[];
  @ApiProperty({ type: String, nullable: true }) groupId!: string | null;
}
export class Group {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number }) qualifierCount!: number;
}
export class Match {
  @ApiPropertyOptional({ type: [MatchStatInput], nullable: true })
  stats?: import("../extraction/extraction.models").MatchStat[] | null;
  @ApiProperty({ type: String, nullable: true }) knockoutTieId?: string | null;
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, enum: matchStages }) stage!: MatchStage;
  @ApiProperty({ type: String }) scope!: string;
  @ApiProperty({ type: Number }) round!: number;
  @ApiProperty({ type: Number }) leg!: number;
  @ApiProperty({ type: String }) homeId!: string;
  @ApiProperty({ type: String }) awayId!: string;
  @ApiProperty({ type: Number, nullable: true }) homeScore!: number | null;
  @ApiProperty({ type: Number, nullable: true }) awayScore!: number | null;
  @ApiProperty({ type: Number, nullable: true }) homeTiebreak!: number | null;
  @ApiProperty({ type: Number, nullable: true }) awayTiebreak!: number | null;
  @ApiProperty({ type: String, nullable: true }) winnerId!: string | null;
  @ApiProperty({ type: Number }) revision!: number;
}
export class ByeView {
  @ApiProperty({ type: Number }) slot?: number;
  @ApiProperty({ type: String }) entrantId!: string;
}
export class Round {
  @ApiProperty({ enum: ["MANUAL", "RANDOM", "FIXED"] }) method?:
    "MANUAL" | "RANDOM" | "FIXED";
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number }) number!: number;
  @ApiProperty({ type: [ByeView] }) byes!: ByeView[];
}
export class Standing {
  @ApiProperty({ type: String }) entrantId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number }) played!: number;
  @ApiProperty({ type: Number }) won!: number;
  @ApiProperty({ type: Number }) drawn!: number;
  @ApiProperty({ type: Number }) lost!: number;
  @ApiProperty({ type: Number }) scoreFor!: number;
  @ApiProperty({ type: Number }) scoreAgainst!: number;
  @ApiProperty({ type: Number }) difference!: number;
  @ApiProperty({ type: Number }) points!: number;
  @ApiProperty({ type: Number }) rank!: number;
  @ApiProperty({ type: String, nullable: true }) tieSignature!: string | null;
  @ApiProperty({ type: Boolean }) tieResolved!: boolean;
}
export class Tie {
  @ApiProperty({ type: String }) scope!: string;
  @ApiProperty({ type: String }) signature!: string;
  @ApiProperty({ type: [String] }) order!: string[];
}
export class Qualification {
  @ApiProperty({ type: [String] }) entrantIds!: string[];
}
export class QualificationGroup {
  @ApiProperty({ type: String }) groupId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: [String] }) entrantIds!: string[];
}
export class QualificationPreview {
  @ApiProperty({ type: [QualificationGroup] }) groups!: QualificationGroup[];
  @ApiProperty({ type: [String] }) entrantIds!: string[];
}
export class Eligibility {
  @ApiProperty({ type: Number }) round!: number;
  @ApiProperty({ type: [String] }) entrantIds!: string[];
  @ApiProperty({ type: Number }) byeCount!: number;
}
export class ScopeStanding {
  @ApiProperty({ type: String }) scope!: string;
  @ApiProperty({ type: [Standing] }) rows!: Standing[];
}
export class KnockoutTieView {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) roundId!: string;
  @ApiProperty({ type: Number }) slot!: number;
  @ApiProperty({ type: String }) homeId!: string;
  @ApiProperty({ type: String }) awayId!: string;
  @ApiProperty({ type: Number }) legs!: number;
  @ApiProperty({ type: Number, nullable: true }) homeTiebreak!: number | null;
  @ApiProperty({ type: Number, nullable: true }) awayTiebreak!: number | null;
  @ApiProperty({ type: String, nullable: true }) winnerId!: string | null;
  @ApiProperty({ type: Number }) homeAggregate!: number;
  @ApiProperty({ type: Number }) awayAggregate!: number;
}
export class ImportEntrant {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: [String] }) aliases!: string[];
}
export class EntrantPage {
  @ApiProperty({ type: [ImportEntrant] }) items!: ImportEntrant[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) limit!: number;
}
export class DrawPreview {
  @ApiProperty({ type: Number }) round!: number;
  @ApiProperty({
    type: "array",
    items: { type: "array", items: { type: "string" } },
  })
  pairs!: string[][];
  @ApiProperty({ type: [String] }) byes!: string[];
  @ApiProperty({ type: String }) drawToken!: string;
}
@ApiExtraModels(Qualification, QualificationPreview, Eligibility)
export class TournamentView {
  @ApiProperty({ type: Boolean }) statsEnabled!: boolean;
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) publicId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, enum: games }) game!: Game;
  @ApiProperty({ type: String, enum: formats }) format!: CompetitionFormat;
  @ApiProperty({ type: String, enum: statuses }) status!: CompetitionStatus;
  @ApiProperty({ type: String, enum: competitionStages })
  currentStage!: CompetitionStage;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: Number }) knockoutLegs!: number;
  @ApiProperty({ type: Number }) knockoutFinalLegs!: number;
  @ApiProperty({ type: [KnockoutTieView] }) knockoutTies!: KnockoutTieView[];
  @ApiProperty({ type: Number }) legs!: number;
  @ApiProperty({ type: Number }) winPoints!: number;
  @ApiProperty({ type: Number }) drawPoints!: number;
  @ApiProperty({ type: Number }) lossPoints!: number;
  @ApiProperty({ type: String, nullable: true }) championId!: string | null;
  @ApiProperty({ type: [Entrant] }) entrants!: Entrant[];
  @ApiProperty({ type: [Group] }) groups!: Group[];
  @ApiProperty({ type: [Match] }) matches!: Match[];
  @ApiProperty({ type: [Round] }) rounds!: Round[];
  @ApiProperty({ type: [Tie] }) ties!: Tie[];
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(Qualification) },
      { type: "object", nullable: true, enum: [null] },
    ],
  })
  qualification!: Qualification | null;
  @ApiProperty({ type: [ScopeStanding] }) standings!: ScopeStanding[];
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(QualificationPreview) },
      { type: "object", nullable: true, enum: [null] },
    ],
  })
  qualificationPreview!: QualificationPreview | null;
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(Eligibility) },
      { type: "object", nullable: true, enum: [null] },
    ],
  })
  knockoutEligibility!: Eligibility | null;
}
export class Fixture {
  @ApiProperty({ type: String }) homeId!: string;
  @ApiProperty({ type: String }) awayId!: string;
  @ApiProperty({ type: String }) scope!: string;
  @ApiProperty({ type: String }) pairingKey!: string;
  @ApiProperty({ type: Number }) round!: number;
  @ApiProperty({ type: Number }) leg!: number;
}
export class HistoryEntry {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({
    type: String,
    enum: ["RESET", "CLEAR", "SCORE", "STATS_ARCHIVE"],
  })
  action!: AuditAction;
  @ApiProperty({ type: String, nullable: true }) matchId!: string | null;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: "object", additionalProperties: true, nullable: true })
  before!: unknown;
  @ApiProperty({ type: "object", additionalProperties: true, nullable: true })
  after!: unknown;
}
export class TournamentSummary {
  @ApiProperty({ type: Boolean }) statsEnabled!: boolean;
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) publicId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, enum: games }) game!: Game;
  @ApiProperty({ type: String, enum: formats }) format!: CompetitionFormat;
  @ApiProperty({ type: String, enum: statuses }) status!: CompetitionStatus;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: Number }) legs!: number;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: Number }) entrantCount!: number;
  @ApiProperty({ type: Number }) matchCount!: number;
  @ApiProperty({ type: Number }) completedMatchCount!: number;
  @ApiProperty({ type: [Entrant] }) entrantPreview!: Entrant[];
}
export class DashboardTotals {
  @ApiProperty({ type: Number }) tournaments!: number;
  @ApiProperty({ type: Number }) active!: number;
  @ApiProperty({ type: Number }) draft!: number;
  @ApiProperty({ type: Number }) completed!: number;
  @ApiProperty({ type: Number }) entrants!: number;
}
export class TournamentPage {
  @ApiProperty({ type: [TournamentSummary] }) items!: TournamentSummary[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: DashboardTotals }) totals!: DashboardTotals;
}
export class HistoryPage {
  @ApiProperty({ type: [HistoryEntry] }) items!: HistoryEntry[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) limit!: number;
}
export class FixturePage {
  @ApiProperty({ type: [Fixture] }) items!: Fixture[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) limit!: number;
}
