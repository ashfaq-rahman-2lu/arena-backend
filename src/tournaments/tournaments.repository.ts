import {
  auditActions,
  games,
  formats,
  statuses,
  matchStages,
  competitionStages,
} from "../domain/competition-values";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ApplicationError } from "../common/application-error";
import { PageQuery, TournamentListQuery } from "../common/pagination.dto";
import { DatabaseService } from "../database/database.service";
import { TournamentSetup } from "./tournament-request.dto";
import {
  HistoryPage,
  TournamentPage,
  TournamentSummary,
} from "./tournament-response.dto";
import { TournamentAggregate } from "./tournament.models";
import { text } from "express";
const include = {
  entrants: { orderBy: [{ name: "asc" }, { id: "asc" }] },
  groups: { orderBy: [{ name: "asc" }, { id: "asc" }] },
  matches: {
    orderBy: [
      { scope: "asc" },
      { round: "asc" },
      { leg: "asc" },
      { pairingKey: "asc" },
    ],
  },
  knockoutTies: { orderBy: { slot: "asc" } },
  rounds: { include: { byes: true }, orderBy: { number: "asc" } },
  ties: true,
  qualification: true,
} satisfies Prisma.TournamentInclude;
interface TournamentIdentity {
  id: string;
}
interface RoundIdentity {
  id: string;
  number: number;
}
export type TransactionClient = Prisma.TransactionClient;
type TournamentRecord = Prisma.TournamentGetPayload<{
  include: typeof include;
}>;
function storedValue<T extends string>(
  value: string,
  allowed: readonly T[],
): T {
  const found = allowed.find((candidate: T): boolean => candidate === value);
  if (found === undefined)
    throw new ApplicationError(
      "INTERNAL_ERROR",
      500,
      "Stored competition data is invalid.",
    );
  return found;
}
function mapAggregate(t: TournamentRecord): TournamentAggregate {
  return {
    id: t.id,
    publicId: t.publicId,
    ownerId: t.ownerId,
    name: t.name,
    game: storedValue(t.game, games),
    format: storedValue(t.format, formats),
    status: storedValue(t.status, statuses),
    currentStage: storedValue(t.currentStage, competitionStages),
    revision: t.revision,
    knockoutLegs: t.knockoutLegs,
    knockoutFinalLegs: t.knockoutFinalLegs,
    knockoutTies: t.knockoutTies.map(
      (
        tie: TournamentRecord["knockoutTies"][number],
      ): import("../domain/engine").KnockoutTie => ({
        id: tie.id,
        roundId: tie.roundId,
        slot: tie.slot,
        homeId: tie.homeId,
        awayId: tie.awayId,
        legs: tie.legs,
        homeTiebreak: tie.homeTiebreak,
        awayTiebreak: tie.awayTiebreak,
        winnerId: tie.winnerId,
      }),
    ),
    legs: t.legs,
    winPoints: t.winPoints,
    drawPoints: t.drawPoints,
    lossPoints: t.lossPoints,
    championId: t.championId,
    entrants: t.entrants.map(
      (
        e: TournamentRecord["entrants"][number],
      ): TournamentAggregate["entrants"][number] => ({
        id: e.id,
        name: e.name,
        aliases: e.aliases,
        groupId: e.groupId,
      }),
    ),
    groups: t.groups.map(
      (
        g: TournamentRecord["groups"][number],
      ): TournamentAggregate["groups"][number] => ({
        id: g.id,
        name: g.name,
        qualifierCount: g.qualifierCount,
      }),
    ),
    matches: t.matches.map(
      (
        m: TournamentRecord["matches"][number],
      ): TournamentAggregate["matches"][number] => ({
        knockoutTieId: m.knockoutTieId,
        id: m.id,
        stage: storedValue(m.stage, matchStages),
        scope: m.scope,
        round: m.round,
        leg: m.leg,
        homeId: m.homeId,
        awayId: m.awayId,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homeTiebreak: m.homeTiebreak,
        awayTiebreak: m.awayTiebreak,
        winnerId: m.winnerId,
        revision: m.revision,
      }),
    ),
    rounds: t.rounds.map(
      (
        r: TournamentRecord["rounds"][number],
      ): TournamentAggregate["rounds"][number] => ({
        id: r.id,
        method: storedValue(r.method, ["MANUAL", "RANDOM", "FIXED"] as const),
        number: r.number,
        byes: r.byes.map(
          (
            b: TournamentRecord["rounds"][number]["byes"][number],
          ): { entrantId: string; slot: number } => ({
            entrantId: b.entrantId,
            slot: b.slot,
          }),
        ),
      }),
    ),
    ties: t.ties.map(
      (
        tie: TournamentRecord["ties"][number],
      ): TournamentAggregate["ties"][number] => ({
        scope: tie.scope,
        signature: tie.signature,
        order: tie.order,
      }),
    ),
    qualification: t.qualification
      ? { entrantIds: t.qualification.entrantIds }
      : null,
  };
}
const auditKeys = new Set([
  "knockoutTie",
  "knockoutTies",
  "knockoutTieId",
  "legs",
  "slot",
  "roundId",
  "method",
  "id",
  "stage",
  "scope",
  "round",
  "leg",
  "homeId",
  "awayId",
  "homeScore",
  "awayScore",
  "homeTiebreak",
  "awayTiebreak",
  "winnerId",
  "revision",
  "matches",
  "rounds",
  "number",
  "byes",
  "entrantId",
  "entrantIds",
  "qualification",
  "reason",
  "roundIds",
  "matchIds",
  "resetQualification",
]);
export function auditPayload(value: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(value))
    return value.map((entry: Prisma.JsonValue): Prisma.JsonValue =>
      auditPayload(entry),
    );
  if (value && typeof value === "object") {
    const mapped: Prisma.JsonObject = {};
    for (const [key, entry] of Object.entries(value))
      if (auditKeys.has(key) && entry !== undefined)
        mapped[key] = auditPayload(entry);
    return mapped;
  }
  return value;
}
@Injectable()
export class TournamentsRepository {
  constructor(private readonly db: DatabaseService) {}
  transaction<T>(operation: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(operation, { timeout: 20000 });
  }
  async load(
    id: string,
    tx: TransactionClient = this.db,
  ): Promise<TournamentAggregate> {
    console.log("history", id);

    const t = await tx.tournament.findUnique({ where: { id }, include });
    console.log("", id);
    if (!t)
      throw new ApplicationError("NOT_FOUND", 404, "Tournament not found");
    return mapAggregate(t);
  }
  async publicView(publicId: string): Promise<TournamentAggregate> {
    const t = await this.db.tournament.findUnique({
      where: { publicId: publicId.trim().toUpperCase() },
      include,
    });
    if (!t)
      throw new ApplicationError(
        "NOT_FOUND",
        404,
        "No tournament found with that ID",
      );
    return mapAggregate(t);
  }
  async matchTournamentId(id: string): Promise<string> {
    const match = await this.db.match.findUnique({
      where: { id },
      select: { tournamentId: true },
    });
    if (!match) throw new ApplicationError("NOT_FOUND", 404, "Match not found");
    return match.tournamentId;
  }
  async history(id: string, query: PageQuery): Promise<HistoryPage> {
    const [items, total] = await this.db.$transaction([
      this.db.resultRevision.findMany({
        where: { tournamentId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          action: true,
          matchId: true,
          createdAt: true,
          before: true,
          after: true,
        },
      }),
      this.db.resultRevision.count({ where: { tournamentId: id } }),
    ]);
    return {
      items: items.map(
        (item: (typeof items)[number]): HistoryPage["items"][number] => ({
          id: item.id,
          action: storedValue(item.action, auditActions),
          matchId: item.matchId,
          createdAt: item.createdAt.toISOString(),
          before: auditPayload(item.before),
          after: auditPayload(item.after),
        }),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  async list(
    ownerId: string,
    query: TournamentListQuery,
  ): Promise<TournamentPage> {
    const where: Prisma.TournamentWhereInput = {
      ownerId,
      ...(query.search
        ? { name: { contains: query.search, mode: "insensitive" } }
        : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total, ownerTotal, active, draft, finished, entrants] =
      await this.db.$transaction([
        this.db.tournament.findMany({
          where,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            publicId: true,
            name: true,
            game: true,
            format: true,
            status: true,
            createdAt: true,
            legs: true,
            revision: true,
            entrants: {
              take: 4,
              orderBy: [{ name: "asc" }, { id: "asc" }],
              select: { id: true, name: true, aliases: true, groupId: true },
            },
            _count: { select: { entrants: true, matches: true } },
          },
        }),
        this.db.tournament.count({ where }),
        this.db.tournament.count({ where: { ownerId } }),
        this.db.tournament.count({ where: { ownerId, status: "ACTIVE" } }),
        this.db.tournament.count({ where: { ownerId, status: "DRAFT" } }),
        this.db.tournament.count({ where: { ownerId, status: "COMPLETED" } }),
        this.db.entrant.count({ where: { tournament: { ownerId } } }),
      ]);
    const completed = await this.db.match.groupBy({
      by: ["tournamentId"],
      where: {
        tournamentId: {
          in: items.map((item: (typeof items)[number]): string => item.id),
        },
        homeScore: { not: null },
        awayScore: { not: null },
      },
      _count: true,
    });
    const totals = {
      tournaments: ownerTotal,
      active,
      draft,
      completed: finished,
      entrants,
    };
    return {
      items: items.map((item: (typeof items)[number]): TournamentSummary => ({
        id: item.id,
        publicId: item.publicId,
        name: item.name,
        game: storedValue(item.game, games),
        format: storedValue(item.format, formats),
        status: storedValue(item.status, statuses),
        legs: item.legs,
        revision: item.revision,
        createdAt: item.createdAt.toISOString(),
        entrantCount: item._count.entrants,
        entrantPreview: item.entrants,
        matchCount: item._count.matches,
        completedMatchCount:
          completed.find(
            (group: (typeof completed)[number]): boolean =>
              group.tournamentId === item.id,
          )?._count ?? 0,
      })),
      total,
      page: query.page,
      limit: query.limit,
      totals,
    };
  }
  async entrantPage(
    id: string,
    ownerId: string,
    query: PageQuery,
  ): Promise<import("./tournament-response.dto").EntrantPage> {
    const identity = await this.db.tournament.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!identity)
      throw new ApplicationError("NOT_FOUND", 404, "Tournament not found");
    if (identity.ownerId !== ownerId)
      throw new ApplicationError(
        "FORBIDDEN",
        403,
        "Only the owner can import teams",
      );
    const [items, total] = await this.db.$transaction([
      this.db.entrant.findMany({
        where: { tournamentId: id },
        select: { id: true, name: true, aliases: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.entrant.count({ where: { tournamentId: id } }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
  async entrantCreateMany(
    tx: TransactionClient,
    data: Prisma.EntrantCreateManyInput[],
  ): Promise<void> {
    await tx.entrant.createMany({ data });
  }
  async tieCreateMany(
    tx: TransactionClient,
    data: Prisma.KnockoutTieCreateManyInput[],
  ): Promise<void> {
    await tx.knockoutTie.createMany({ data });
  }
  async tieUpdate(
    tx: TransactionClient,
    id: string,
    data: Prisma.KnockoutTieUpdateInput,
  ): Promise<void> {
    await tx.knockoutTie.update({ where: { id }, data });
  }
  async replaceSetup(
    tx: TransactionClient,
    id: string,
    input: TournamentSetup,
  ): Promise<void> {
    await tx.entrant.deleteMany({ where: { tournamentId: id } });
    await tx.group.deleteMany({ where: { tournamentId: id } });
    const groups =
      input.format === "WORLD_CUP"
        ? input.groups.map(
            (
              group: TournamentSetup["groups"][number],
            ): Prisma.GroupCreateManyInput => ({
              id: randomUUID(),
              ...group,
              tournamentId: id,
            }),
          )
        : [];
    if (groups.length) await tx.group.createMany({ data: groups });
    await tx.entrant.createMany({
      data: input.entrants.map(
        (
          entrant: TournamentSetup["entrants"][number],
        ): Prisma.EntrantCreateManyInput => {
          const group =
            entrant.groupIndex != null ? groups[entrant.groupIndex] : null;
          return {
            id: entrant.id ?? randomUUID(),
            tournamentId: id,
            name: entrant.name,
            nameKey: entrant.name.toLocaleLowerCase("en-US"),
            aliases: entrant.aliases,
            groupId: input.format === "WORLD_CUP" ? (group?.id ?? null) : null,
          };
        },
      ),
    });
    await tx.tournament.update({
      where: { id },
      data: {
        name: input.name,
        game: input.game,
        format: input.format,
        knockoutLegs: input.knockoutLegs,
        knockoutFinalLegs: input.knockoutFinalLegs,
        legs: input.legs,
        winPoints: input.winPoints,
        drawPoints: input.drawPoints,
        lossPoints: input.lossPoints,
      },
    });
  }

  async lockTournament(tx: TransactionClient, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${id} FOR UPDATE`;
  }
  isPublicIdCollision(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      String(error.meta?.target).includes("publicId")
    );
  }
  async tournamentCreate(
    tx: TransactionClient,
    args: Prisma.TournamentCreateArgs,
  ): Promise<TournamentIdentity> {
    return await tx.tournament.create(args);
  }
  async tournamentUpdate(
    tx: TransactionClient,
    args: Prisma.TournamentUpdateArgs,
  ): Promise<void> {
    await tx.tournament.update(args);
  }
  async matchCreateMany(
    tx: TransactionClient,
    args: Prisma.MatchCreateManyArgs,
  ): Promise<void> {
    await tx.match.createMany(args);
  }
  async entrantUpdate(
    tx: TransactionClient,
    args: Prisma.EntrantUpdateArgs,
  ): Promise<void> {
    await tx.entrant.update(args);
  }
  async tieResolutionUpsert(
    tx: TransactionClient,
    args: Prisma.TieResolutionUpsertArgs,
  ): Promise<void> {
    await tx.tieResolution.upsert(args);
  }
  async qualificationDecisionCreate(
    tx: TransactionClient,
    args: Prisma.QualificationDecisionCreateArgs,
  ): Promise<void> {
    await tx.qualificationDecision.create(args);
  }
  async roundCreate(
    tx: TransactionClient,
    args: Prisma.RoundCreateArgs,
  ): Promise<RoundIdentity> {
    return await tx.round.create(args);
  }
  async byeCreateMany(
    tx: TransactionClient,
    args: Prisma.ByeCreateManyArgs,
  ): Promise<void> {
    await tx.bye.createMany(args);
  }
  async resultRevisionCreate(
    tx: TransactionClient,
    args: Prisma.ResultRevisionCreateArgs,
  ): Promise<void> {
    await tx.resultRevision.create(args);
  }
  async roundDeleteMany(
    tx: TransactionClient,
    args: Prisma.RoundDeleteManyArgs,
  ): Promise<void> {
    await tx.round.deleteMany(args);
  }
  async qualificationDecisionDeleteMany(
    tx: TransactionClient,
    args: Prisma.QualificationDecisionDeleteManyArgs,
  ): Promise<void> {
    await tx.qualificationDecision.deleteMany(args);
  }
  async matchUpdate(
    tx: TransactionClient,
    args: Prisma.MatchUpdateArgs,
  ): Promise<void> {
    await tx.match.update(args);
  }
  async tieResolutionDeleteMany(
    tx: TransactionClient,
    args: Prisma.TieResolutionDeleteManyArgs,
  ): Promise<void> {
    await tx.tieResolution.deleteMany(args);
  }
}
