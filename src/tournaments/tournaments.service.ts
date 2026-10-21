import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { ApplicationError } from "../common/application-error";
import { PageQuery, TournamentListQuery } from "../common/pagination.dto";
import { paginate } from "../common/pagination.models";
import { ConfigurationService } from "../config/configuration.service";
import {
  Competition,
  KnockoutTie,
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
  EntrantsAddition,
  NewEntrant,
  TournamentNameUpdate,
  DrawInput,
  BracketSlot,
  EntrantUpdate,
  GroupSetup,
  PairingInput,
  TournamentSetup as SetupInput,
  TieInput,
} from "./tournament-request.dto";
import {
  DrawPreview,
  EntrantPage,
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
import { additionalFixtures, aggregateOutcome } from "../domain/knockout-rules";
interface PreparedResult {
  score: ValidateScoreResult;
  tie?: KnockoutTie;
}
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
    invariant(
      input.knockoutFinalLegs <= input.knockoutLegs,
      "Final legs cannot exceed knockout legs",
    );
    if (input.format === "KNOCKOUT") {
      input.groups = [];
      input.legs = 1;
      input.winPoints = 3;
      input.drawPoints = 1;
      input.lossPoints = 0;
      input.entrants.forEach((e: EntrantSetup): void => {
        e.groupIndex = null;
      });
    }
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
            currentStage:
              t.format === "KNOCKOUT"
                ? "KNOCKOUT"
                : t.format === "LEAGUE"
                  ? "LEAGUE"
                  : "GROUP",
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
  async renameTournament(
    id: string,
    userId: string,
    input: TournamentNameUpdate,
  ): Promise<TournamentView> {
    return this.mutate(
      id,
      userId,
      input.expectedRevision,
      async (tx: Tx): Promise<void> => {
        await this.repository.tournamentUpdate(tx, {
          where: { id },
          data: { name: input.name },
        });
      },
    );
  }
  entrants(id: string, userId: string, query: PageQuery): Promise<EntrantPage> {
    return this.repository.entrantPage(id, userId, query);
  }
  async addEntrants(
    id: string,
    userId: string,
    input: EntrantsAddition,
  ): Promise<TournamentView> {
    return this.mutate(
      id,
      userId,
      input.expectedRevision,
      async (tx: Tx, t: TournamentAggregate): Promise<void> => {
        invariant(
          t.status !== "DRAFT" &&
            (t.format === "LEAGUE" ||
              (t.format === "WORLD_CUP" &&
                t.currentStage === "GROUP" &&
                !t.qualification)),
          "Participant additions are locked for this stage",
        );
        invariant(
          t.entrants.length + input.entrants.length <= 256,
          "Use at most 256 teams",
        );
        const names = [
          ...t.entrants.map((e: Entrant): string =>
            e.name.toLocaleLowerCase("en-US"),
          ),
          ...input.entrants.map((e: NewEntrant): string =>
            e.name.toLocaleLowerCase("en-US"),
          ),
        ];
        invariant(
          new Set(names).size === names.length,
          "Team names must be unique",
        );
        const added: Entrant[] = input.entrants.map(
          (e: NewEntrant): Entrant => {
            invariant(
              t.format === "LEAGUE"
                ? !e.groupId
                : t.groups.some(
                    (g: Competition["groups"][number]): boolean =>
                      g.id === e.groupId,
                  ),
              "Choose an existing group for every team",
            );
            return {
              id: randomUUID(),
              name: e.name,
              aliases: e.aliases,
              groupId: t.format === "LEAGUE" ? null : (e.groupId ?? null),
            };
          },
        );
        await this.repository.entrantCreateMany(
          tx,
          added.map(
            (
              e: Entrant,
            ): import("@prisma/client").Prisma.EntrantCreateManyInput => ({
              ...e,
              tournamentId: id,
              nameKey: e.name.toLocaleLowerCase("en-US"),
            }),
          ),
        );
        const scopes =
          t.format === "LEAGUE"
            ? ["LEAGUE"]
            : [...new Set(added.map((e: Entrant): string => e.groupId ?? ""))];
        const fixtures = scopes.flatMap(
          (scope: string): ReturnType<typeof additionalFixtures> =>
            additionalFixtures(
              [...t.entrants, ...added],
              t.matches,
              added.map((e: Entrant): string => e.id),
              t.legs,
              scope,
            ),
        );
        await this.repository.matchCreateMany(tx, {
          data: fixtures.map(
            (
              f: ReturnType<typeof additionalFixtures>[number],
            ): import("@prisma/client").Prisma.MatchCreateManyInput => ({
              ...f,
              tournamentId: id,
              stage: t.format === "LEAGUE" ? "LEAGUE" : "GROUP",
            }),
          ),
        });
      },
    );
  }
  drawToken(
    t: Competition,
    input: { round: number; pairs: string[][]; byes: string[] },
  ): string {
    return createHmac("sha256", this.config.values.sessionSecret)
      .update(
        JSON.stringify([
          "DRAW",
          t.id,
          t.revision,
          input.round,
          input.pairs,
          input.byes,
        ]),
      )
      .digest("hex");
  }
  async draw(
    id: string,
    userId: string,
    input: DrawInput,
  ): Promise<DrawPreview> {
    const t = await this.owned(id, userId);
    if (t.revision !== input.expectedRevision)
      throw new ApplicationError(
        "REVISION_CONFLICT",
        409,
        "Tournament changed. Refresh and try again.",
      );
    invariant(t.rounds[0]?.method !== "FIXED", "The bracket is fixed");
    const eligible = knockoutEligibility(t);
    invariant(
      input.byes.length === eligible.byeCount &&
        new Set(input.byes).size === input.byes.length &&
        input.byes.every((id: string): boolean =>
          eligible.entrantIds.includes(id),
        ),
      "Choose the required bye recipients",
    );
    const ids = eligible.entrantIds.filter(
      (id: string): boolean => !input.byes.includes(id),
    );
    for (let i = ids.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const pairs: [string, string][] = [];
    for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
    const draw = { round: eligible.round, pairs, byes: input.byes };
    return { ...draw, drawToken: this.drawToken(t, draw) };
  }
  async createRound(
    tx: Tx,
    t: TournamentAggregate,
    input: PairingInput,
  ): Promise<void> {
    const eligible = knockoutEligibility(t);
    validatePairings(eligible, input.pairs, input.byes);
    const slots = input.slots ?? [
      ...input.pairs.map((_p: string[], index: number): BracketSlot => ({
        kind: "PAIR",
        index,
      })),
      ...input.byes.map((_id: string, index: number): BracketSlot => ({
        kind: "BYE",
        index,
      })),
    ];
    const keys = slots.map(
      (slot: BracketSlot): string => `${slot.kind}:${slot.index}`,
    );
    invariant(
      slots.length === input.pairs.length + input.byes.length &&
        new Set(keys).size === keys.length &&
        slots.every((slot: BracketSlot): boolean =>
          slot.kind === "PAIR"
            ? slot.index < input.pairs.length
            : slot.index < input.byes.length,
        ),
      "Use each opening pairing and bye slot exactly once",
    );
    const r = await this.repository.roundCreate(tx, {
      data: {
        tournamentId: t.id,
        number: eligible.round,
        method: input.method,
      },
    });
    const legs =
      eligible.entrantIds.length === 2
        ? (t.knockoutFinalLegs ?? 1)
        : (t.knockoutLegs ?? 1);
    const matches: import("@prisma/client").Prisma.MatchCreateManyInput[] = [];
    const ties: import("@prisma/client").Prisma.KnockoutTieCreateManyInput[] =
      [];
    const byes: import("@prisma/client").Prisma.ByeCreateManyInput[] = [];
    for (let slot = 0; slot < slots.length; slot++) {
      const entry = slots[slot];
      if (entry.kind === "BYE") {
        byes.push({
          tournamentId: t.id,
          roundId: r.id,
          entrantId: input.byes[entry.index],
          slot,
        });
        continue;
      }
      const [homeId, awayId] = input.pairs[entry.index];
      const tieId = randomUUID();
      ties.push({
        id: tieId,
        tournamentId: t.id,
        roundId: r.id,
        slot,
        homeId,
        awayId,
        legs,
      });
      for (let leg = 1; leg <= legs; leg++)
        matches.push({
          tournamentId: t.id,
          knockoutRoundId: r.id,
          knockoutTieId: tieId,
          stage: "KNOCKOUT",
          scope: "KNOCKOUT",
          round: r.number,
          leg,
          homeId: leg === 1 ? homeId : awayId,
          awayId: leg === 1 ? awayId : homeId,
          pairingKey: pairingKey(homeId, awayId),
        });
    }
    await this.repository.tieCreateMany(tx, ties);
    if (byes.length) await this.repository.byeCreateMany(tx, { data: byes });
    await this.repository.matchCreateMany(tx, { data: matches });
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
        invariant(t.rounds[0]?.method !== "FIXED", "The bracket is fixed");
        invariant(
          input.method !== "FIXED" || !t.rounds.length,
          "Choose a fixed bracket before the first round",
        );
        if (input.method === "RANDOM")
          invariant(
            input.drawToken ===
              this.drawToken(t, {
                round: knockoutEligibility(t).round,
                pairs: input.pairs,
                byes: input.byes,
              }),
            "Review a fresh random draw before confirming",
          );
        await this.createRound(tx, t, input);
      },
    );
  }
  async advanceFixed(tx: Tx, id: string): Promise<void> {
    const t = await this.load(id, tx);
    if (t.rounds[0]?.method !== "FIXED") return;
    let eligible: ReturnType<typeof knockoutEligibility>;
    try {
      eligible = knockoutEligibility(t);
    } catch {
      return;
    }
    const pairs: [string, string][] = [];
    for (let i = 0; i < eligible.entrantIds.length; i += 2)
      pairs.push([eligible.entrantIds[i], eligible.entrantIds[i + 1]]);
    await this.createRound(tx, t, {
      pairs,
      byes: [],
      method: "FIXED",
      expectedRevision: t.revision,
    });
  }
  async ownerMatch(matchId: string, userId: string): Promise<OwnerMatchResult> {
    const tournamentId = await this.repository.matchTournamentId(matchId);
    const t = await this.owned(tournamentId, userId);
    const m = t.matches.find((match: Match): boolean => match.id === matchId);
    if (!m) throw new ApplicationError("NOT_FOUND", 404, "Match not found");
    return { m, t };
  }
  prepareResult(t: Competition, m: Match, input: ResultInput): PreparedResult {
    const tie = (t.knockoutTies ?? []).find(
      (x: KnockoutTie): boolean => x.id === m.knockoutTieId,
    );
    if (!tie || tie.legs === 1) {
      invariant(
        !input.knockoutDecision,
        "Use the match tiebreak fields for single-match ties",
      );
      const score = validateScore(m, input);
      return {
        score,
        tie: tie
          ? {
              ...tie,
              winnerId: score.winnerId,
              homeTiebreak: score.homeTiebreak,
              awayTiebreak: score.awayTiebreak,
            }
          : undefined,
      };
    }
    invariant(
      input.homeTiebreak == null &&
        input.awayTiebreak == null &&
        input.winnerId == null,
      "Use the aggregate decision for two-leg ties",
    );
    const score = validateScore(
      { ...m, stage: "LEAGUE" },
      { homeScore: input.homeScore, awayScore: input.awayScore },
    );
    const changed =
      m.homeScore !== score.homeScore || m.awayScore !== score.awayScore;
    invariant(
      !input.knockoutDecision || m.leg === tie.legs,
      "Decide the aggregate from the second leg",
    );
    const decision =
      input.knockoutDecision ??
      (changed
        ? undefined
        : {
            homeTiebreak: tie.homeTiebreak,
            awayTiebreak: tie.awayTiebreak,
            winnerId: tie.winnerId,
          });
    const matches = t.matches.map((x: Match): Match =>
      x.id === m.id ? { ...x, ...score } : x,
    );
    // Persist a decision only for a level aggregate; a winner from unequal scores is derived.
    const base = aggregateOutcome(tie, matches);
    const outcome = aggregateOutcome(
      tie,
      matches,
      input.knockoutDecision ??
        (base.complete && base.homeAggregate === base.awayAggregate
          ? decision
          : undefined),
    );
    return {
      score,
      tie: {
        ...tie,
        winnerId: outcome.winnerId,
        homeTiebreak:
          outcome.homeAggregate === outcome.awayAggregate
            ? (decision?.homeTiebreak ?? null)
            : null,
        awayTiebreak:
          outcome.homeAggregate === outcome.awayAggregate
            ? (decision?.awayTiebreak ?? null)
            : null,
      },
    };
  }
  impactToken(
    t: Competition,
    m: Match,
    score: ValidateScoreResult,
    tie?: KnockoutTie,
  ): string {
    return createHmac("sha256", this.config.values.sessionSecret)
      .update(JSON.stringify([t.id, t.revision, m.id, m.revision, score, tie]))
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
    const { score, tie } = this.prepareResult(t, m, input);
    return {
      ...correctionImpact(t, m, score, tie),
      impactToken: this.impactToken(t, m, score, tie),
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
        const { score, tie } = this.prepareResult(t, current, input),
          impact = correctionImpact(t, current, score, tie);
        if (
          impact.requiresReset &&
          (!input.confirmReset ||
            input.impactToken !== this.impactToken(t, current, score, tie))
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
            knockoutTies: (t.knockoutTies ?? []).filter(
              (x: KnockoutTie): boolean => impact.roundIds.includes(x.roundId),
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
            before: {
              ...current,
              knockoutTie:
                (t.knockoutTies ?? []).find(
                  (x: KnockoutTie): boolean => x.id === current.knockoutTieId,
                ) ?? null,
            },
            after: { ...score, knockoutTie: tie ?? null },
          },
        });
        await this.repository.matchUpdate(tx, {
          where: { id: matchId },
          data: { ...score, revision: { increment: 1 } },
        });
        if (tie)
          await this.repository.tieUpdate(tx, tie.id, {
            winnerId: tie.winnerId,
            homeTiebreak: tie.homeTiebreak,
            awayTiebreak: tie.awayTiebreak,
          });
        await this.advanceFixed(tx, t.id);
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
