import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import { ApplicationError } from "../common/application-error";
import { PageQuery, TournamentListQuery } from "../common/pagination.dto";
import { paginate } from "../common/pagination.models";
import { ConfigurationService } from "../config/configuration.service";
import {
  Competition,
  Entrant,
  Match,
  Round,
  Standing,
  ValidateScoreResult,
  completion,
  correctionImpact,
  invariant,
  knockoutEligibility,
  pairingKey,
  previewFixtures,
  qualificationPreview,
  standings,
  tournamentView,
  validatePairings,
  validateScore,
} from "../domain/engine";
import { ResultInput } from "../matches/result-request.dto";
import {
  EntrantSetup,
  EntrantUpdate,
  GroupSetup,
  PairingInput,
  TournamentSetup as SetupInput,
  TieInput,
} from "./tournament-request.dto";
import {
  Fixture,
  FixturePage,
  HistoryPage,
  TournamentPage,
  TournamentView,
} from "./tournament-response.dto";
import { TournamentAggregate } from "./tournament.models";
import {
  TournamentsRepository,
  TransactionClient,
} from "./tournaments.repository";
export type OwnerMatchResult = {
  m: Match;
  t: TournamentAggregate;
};
export type PreviewResultResult = {
  impactToken: string;
  tournamentRevision: number;
  requiresReset: boolean;
  reason: string | null;
  roundIds: string[];
  matchIds: string[];
  resetQualification: boolean;
};
type Tx = TransactionClient;
@Injectable()
export class TournamentsService {
  constructor(
    private readonly repository: TournamentsRepository,
    private readonly config: ConfigurationService,
  ) {}
  async history(
    id: string,
    userId: string,
    query: PageQuery,
  ): Promise<HistoryPage> {
    await this.owned(id, userId);
    return this.repository.history(id, query);
  }
  load(id: string, client?: Tx): Promise<TournamentAggregate> {
    return this.repository.load(id, client);
  }
  async owned(
    id: string,
    userId: string,
    client?: Tx,
  ): Promise<TournamentAggregate> {
    const t = await this.load(id, client);
    if (t.ownerId !== userId)
      throw new ApplicationError(
        "FORBIDDEN",
        403,
        "Only the owner can edit this tournament",
      );
    return t;
  }
  view(t: TournamentAggregate): TournamentView {
    const { ownerId, ...clean } = t;
    return tournamentView(clean);
  }
  async publicView(code: string): Promise<TournamentView> {
    return this.view(await this.repository.publicView(code));
  }
  list(userId: string, query: TournamentListQuery): Promise<TournamentPage> {
    return this.repository.list(userId, query);
  }
  async preview(
    id: string,
    userId: string,
    query: PageQuery,
  ): Promise<FixturePage> {
    const fixtures = previewFixtures(await this.owned(id, userId)).sort(
      (a: Fixture, b: Fixture): number =>
        a.scope.localeCompare(b.scope) ||
        a.round - b.round ||
        a.leg - b.leg ||
        a.pairingKey.localeCompare(b.pairingKey),
    );
    return paginate(fixtures, query.page, query.limit);
  }
  validateSetup(input: SetupInput): void {
    const keys = input.entrants.map((e: EntrantSetup): string =>
      e.name.toLocaleLowerCase("en-US"),
    );
    invariant(
      new Set(keys).size === keys.length,
      "Entrant names must be unique",
    );
    invariant(
      new Set(input.groups.map((g: GroupSetup): string => g.name.toLowerCase()))
        .size === input.groups.length,
      "Group names must be unique",
    );
    if (input.format === "WORLD_CUP") {
      invariant(input.groups.length > 0, "Add groups");
      invariant(
        input.entrants.every(
          (e: EntrantSetup): boolean =>
            e.groupIndex != null && e.groupIndex < input.groups.length,
        ),
        "Assign every entrant to a group",
      );
      for (let i = 0; i < input.groups.length; i++) {
        const size = input.entrants.filter(
          (e: EntrantSetup): boolean => e.groupIndex === i,
        ).length;
        invariant(
          size >= 2,
          `${input.groups[i].name} needs at least two entrants`,
        );
        invariant(
          input.groups[i].qualifierCount <= size,
          `Too many qualifiers in ${input.groups[i].name}`,
        );
      }
      invariant(
        input.groups.reduce(
          (sum: number, g: GroupSetup): number => sum + g.qualifierCount,
          0,
        ) >= 2,
        "At least two teams must qualify",
      );
    }
  }
  async replaceSetup(
    tx: Tx,
    id: string,
    input: SetupInput,
    existingIds: string[] = [],
  ): Promise<void> {
    this.validateSetup(input);
    invariant(
      input.entrants.every(
        (e: EntrantSetup): boolean => !e.id || existingIds.includes(e.id),
      ),
      "Invalid entrant ID",
    );
    invariant(
      new Set(
        input.entrants
          .filter((e: EntrantSetup): string | undefined => e.id)
          .map((e: EntrantSetup): string | undefined => e.id),
      ).size ===
        input.entrants.filter((e: EntrantSetup): string | undefined => e.id)
          .length,
      "Duplicate entrant IDs",
    );
    await this.repository.replaceSetup(tx, id, input);
  }
  async create(userId: string, input: SetupInput): Promise<TournamentView> {
    this.validateSetup(input);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const id = await this.repository.transaction(
          async (tx: Tx): Promise<string> => {
            const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            const publicId = [...randomBytes(10)]
              .map((n: number): string => alphabet[n % alphabet.length])
              .join("");
            const t = await this.repository.tournamentCreate(tx, {
              data: {
                ownerId: userId,
                publicId,
                name: input.name,
                game: input.game,
                format: input.format,
              },
            });
            await this.replaceSetup(tx, t.id, input);
            return t.id;
          },
        );
        return this.view(await this.load(id));
      } catch (e) {
        if (this.repository.isPublicIdCollision(e)) continue;
        throw e;
      }
    }
    throw new ApplicationError(
      "ALREADY_EXISTS",
      409,
      "Could not generate an ID; retry",
    );
  }
  async mutate(
    id: string,
    userId: string,
    expected: number,
    fn: (tx: Tx, t: TournamentAggregate) => Promise<void>,
  ): Promise<TournamentView> {
    await this.repository.transaction(async (tx: Tx): Promise<void> => {
      // Serialize all mutations to a tournament, including start, qualification and score corrections.
      await this.repository.lockTournament(tx, id);
      const t = await this.owned(id, userId, tx);
      if (t.revision !== expected)
        throw new ApplicationError(
          "REVISION_CONFLICT",
          409,
          "Tournament changed. Refresh and try again.",
        );
      await fn(tx, t);
      const updated = await this.load(id, tx);
      const state = completion(updated);
      await this.repository.tournamentUpdate(tx, {
        where: { id },
        data: { ...state, revision: { increment: 1 } },
      });
    });
    return this.view(await this.load(id));
  }
  async update(
    id: string,
    userId: string,
    input: SetupInput & {
      expectedRevision: number;
    },
  ): Promise<TournamentView> {
    return this.mutate(
      id,
      userId,
      input.expectedRevision,
      async (tx: Tx, t: TournamentAggregate): Promise<void> => {
        invariant(
          t.status === "DRAFT",
          "Tournament settings are locked after starting",
        );
        await this.replaceSetup(
          tx,
          id,
          input,
          t.entrants.map((e: Entrant): string => e.id),
        );
      },
    );
  }
  async start(
    id: string,
    userId: string,
    expected: number,
  ): Promise<TournamentView> {
    return this.mutate(
      id,
      userId,
      expected,
      async (tx: Tx, t: TournamentAggregate): Promise<void> => {
        invariant(t.status === "DRAFT", "Tournament has already started");
        const fixtures = previewFixtures(t);
        await this.repository.matchCreateMany(tx, {
          data: fixtures.map(
            (f: {
              homeId: string;
              awayId: string;
              round: number;
              leg: number;
              scope: string;
              pairingKey: string;
            }): {
              tournamentId: string;
              stage: "LEAGUE" | "GROUP" | "KNOCKOUT";
              homeId: string;
              awayId: string;
              round: number;
              leg: number;
              scope: string;
              pairingKey: string;
            } => ({
              ...f,
              tournamentId: id,
              stage: t.format === "LEAGUE" ? "LEAGUE" : "GROUP",
            }),
          ),
        });
        await this.repository.tournamentUpdate(tx, {
          where: { id },
          data: {
            status: "ACTIVE",
            currentStage: t.format === "LEAGUE" ? "LEAGUE" : "GROUP",
          },
        });
      },
    );
  }
  async rename(
    id: string,
    entrantId: string,
    userId: string,
    input: EntrantUpdate,
  ): Promise<TournamentView> {
    return this.mutate(
      id,
      userId,
      input.expectedRevision,
      async (tx: Tx, t: TournamentAggregate): Promise<void> => {
        invariant(
          t.entrants.some((e: Entrant): boolean => e.id === entrantId),
          "Entrant not found",
        );
        invariant(
          !t.entrants.some(
            (e: Entrant): boolean =>
              e.id !== entrantId &&
              e.name.toLocaleLowerCase("en-US") ===
                input.name.toLocaleLowerCase("en-US"),
          ),
          "Name already exists",
        );
        await this.repository.entrantUpdate(tx, {
          where: { id: entrantId },
          data: {
            name: input.name,
            nameKey: input.name.toLocaleLowerCase("en-US"),
            aliases: input.aliases,
          },
        });
      },
    );
  }
  async resolveTie(
    id: string,
    userId: string,
    input: TieInput,
  ): Promise<TournamentView> {
    return this.mutate(
      id,
      userId,
      input.expectedRevision,
      async (tx: Tx, t: TournamentAggregate): Promise<void> => {
        invariant(
          !t.qualification,
          "Correct a result to reopen qualification before changing tie decisions",
        );
        const rows = standings(t, input.scope).filter(
          (r: Standing): boolean => r.tieSignature === input.signature,
        );
        invariant(
          rows.length > 1 &&
            input.order.length === rows.length &&
            new Set(input.order).size === rows.length &&
            rows.every((r: Standing): boolean =>
              input.order.includes(r.entrantId),
            ),
          "Choose a complete order for this tied set",
        );
        await this.repository.tieResolutionUpsert(tx, {
          where: {
            tournamentId_scope_signature: {
              tournamentId: id,
              scope: input.scope,
              signature: input.signature,
            },
          },
          create: {
            tournamentId: id,
            scope: input.scope,
            signature: input.signature,
            order: input.order,
          },
          update: { order: input.order },
        });
      },
    );
  }
  async qualify(
    id: string,
    userId: string,
    expected: number,
  ): Promise<TournamentView> {
    return this.mutate(
      id,
      userId,
      expected,
      async (tx: Tx, t: TournamentAggregate): Promise<void> => {
        invariant(
          t.status !== "DRAFT" && !t.qualification,
          "Qualification is not available",
        );
        const preview = qualificationPreview(t);
        await this.repository.qualificationDecisionCreate(tx, {
          data: { tournamentId: id, entrantIds: preview.entrantIds },
        });
        await this.repository.tournamentUpdate(tx, {
          where: { id },
          data: { currentStage: "KNOCKOUT" },
        });
      },
    );
  }
  async pair(
    id: string,
    userId: string,
    input: PairingInput,
  ): Promise<TournamentView> {
    return this.mutate(
      id,
      userId,
      input.expectedRevision,
      async (tx: Tx, t: TournamentAggregate): Promise<void> => {
        const eligible = knockoutEligibility(t);
        validatePairings(eligible, input.pairs, input.byes);
        const r = await this.repository.roundCreate(tx, {
          data: { tournamentId: id, number: eligible.round },
        });
        await this.repository.matchCreateMany(tx, {
          data: input.pairs.map(
            (
              p: string[],
            ): {
              tournamentId: string;
              stage: "LEAGUE" | "GROUP" | "KNOCKOUT";
              scope: string;
              round: number;
              leg: number;
              homeId: string;
              awayId: string;
              pairingKey: string;
              knockoutRoundId: string;
            } => ({
              tournamentId: id,
              stage: "KNOCKOUT",
              scope: "KNOCKOUT",
              round: r.number,
              leg: 1,
              homeId: p[0],
              awayId: p[1],
              pairingKey: pairingKey(p[0], p[1]),
              knockoutRoundId: r.id,
            }),
          ),
        });
        if (input.byes.length)
          await this.repository.byeCreateMany(tx, {
            data: input.byes.map(
              (
                entrantId: string,
              ): {
                tournamentId: string;
                roundId: string;
                entrantId: string;
              } => ({ tournamentId: id, roundId: r.id, entrantId }),
            ),
          });
      },
    );
  }
  async ownerMatch(matchId: string, userId: string): Promise<OwnerMatchResult> {
    const tournamentId = await this.repository.matchTournamentId(matchId);
    const t = await this.owned(tournamentId, userId);
    const m = t.matches.find((match: Match): boolean => match.id === matchId);
    if (!m) throw new ApplicationError("NOT_FOUND", 404, "Match not found");
    return { m, t };
  }
  impactToken(t: Competition, m: Match, score: ValidateScoreResult): string {
    return createHmac("sha256", this.config.values.sessionSecret)
      .update(JSON.stringify([t.id, t.revision, m.id, m.revision, score]))
      .digest("hex");
  }
  async previewResult(
    matchId: string,
    userId: string,
    input: ResultInput,
  ): Promise<PreviewResultResult> {
    const { t, m } = await this.ownerMatch(matchId, userId);
    if (
      m.revision !== input.expectedRevision ||
      t.revision !== input.expectedTournamentRevision
    )
      throw new ApplicationError(
        "REVISION_CONFLICT",
        409,
        "Match or tournament changed; refresh",
      );
    const score = validateScore(m, input);
    return {
      ...correctionImpact(t, m, score),
      impactToken: this.impactToken(t, m, score),
      tournamentRevision: t.revision,
    };
  }
  async result(
    matchId: string,
    userId: string,
    input: ResultInput,
  ): Promise<TournamentView> {
    const { m, t: ownedTournament } = await this.ownerMatch(matchId, userId);
    return this.mutate(
      ownedTournament.id,
      userId,
      input.expectedTournamentRevision,
      async (tx: Tx, t: TournamentAggregate): Promise<void> => {
        const current = t.matches.find((x: Match): boolean => x.id === matchId);
        if (!current)
          throw new ApplicationError("NOT_FOUND", 404, "Match not found");
        if (current.revision !== input.expectedRevision)
          throw new ApplicationError(
            "REVISION_CONFLICT",
            409,
            "Match changed; refresh",
          );
        invariant(t.status !== "DRAFT", "Start the tournament first");
        const score = validateScore(current, input),
          impact = correctionImpact(t, current, score);
        if (
          impact.requiresReset &&
          (!input.confirmReset ||
            input.impactToken !== this.impactToken(t, current, score))
        )
          throw new ApplicationError(
            "RESET_CONFIRMATION_REQUIRED",
            409,
            "Preview and confirm the downstream reset first",
          );
        if (impact.requiresReset) {
          const before = {
            rounds: t.rounds.filter((r: Round): boolean =>
              impact.roundIds.includes(r.id),
            ),
            matches: t.matches.filter((x: Match): boolean =>
              impact.matchIds.includes(x.id),
            ),
            qualification: impact.resetQualification ? t.qualification : null,
          };
          await this.repository.resultRevisionCreate(tx, {
            data: {
              tournamentId: t.id,
              matchId,
              actorId: userId,
              action: "RESET",
              before: before,
              after: impact,
            },
          });
          await this.repository.roundDeleteMany(tx, {
            where: { id: { in: impact.roundIds } },
          });
          if (impact.resetQualification) {
            await this.repository.qualificationDecisionDeleteMany(tx, {
              where: { tournamentId: t.id },
            });
            await this.repository.tournamentUpdate(tx, {
              where: { id: t.id },
              data: { currentStage: "GROUP" },
            });
          }
        }
        await this.repository.resultRevisionCreate(tx, {
          data: {
            tournamentId: t.id,
            matchId,
            actorId: userId,
            action: score.homeScore === null ? "CLEAR" : "SCORE",
            before: current,
            after: score,
          },
        });
        await this.repository.matchUpdate(tx, {
          where: { id: matchId },
          data: { ...score, revision: { increment: 1 } },
        });
        if (
          current.homeScore !== score.homeScore ||
          current.awayScore !== score.awayScore
        )
          await this.repository.tieResolutionDeleteMany(tx, {
            where: { tournamentId: t.id, scope: current.scope },
          });
      },
    );
  }
}
