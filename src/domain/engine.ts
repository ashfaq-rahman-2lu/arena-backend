import { invariant, completed, roundRobin } from "./competition-fixtures";
export {
  RuleError,
  invariant,
  completed,
  pairingKey,
  roundRobin,
} from "./competition-fixtures";
import { aggregateOutcome } from "./knockout-rules";
export type ScheduledFixture = {
  homeId: string;
  awayId: string;
  round: number;
  leg: number;
  scope: string;
  pairingKey: string;
};
export type Bye = {
  entrantId: string;
};
export type Qualification = {
  entrantIds: string[];
};
export type ScopeStanding = {
  scope: string;
  rows: Standing[];
};
export type QualificationGroup = {
  groupId: string;
  name: string;
  entrantIds: string[];
};
import type {
  Game,
  CompetitionFormat,
  CompetitionStatus,
  MatchStage,
  CompetitionStage,
} from "./competition-values";
export type QualificationPreviewResult = {
  groups: QualificationGroup[];
  entrantIds: string[];
};
export type KnockoutEligibilityResult = {
  round: number;
  entrantIds: string[];
  byeCount: number;
};
export type ValidateScoreResult =
  | {
      homeScore: null;
      awayScore: null;
      homeTiebreak: null;
      awayTiebreak: null;
      winnerId: null;
    }
  | {
      homeScore: number;
      awayScore: number | null;
      homeTiebreak: number | null;
      awayTiebreak: number | null;
      winnerId: string | null;
    };
export type CorrectionImpactResult = {
  requiresReset: boolean;
  reason: string | null;
  roundIds: string[];
  matchIds: string[];
  resetQualification: boolean;
};
export type CompletionResult = {
  status: CompetitionStatus;
  championId: string | null;
};
export type TournamentViewResult = {
  standings: ScopeStanding[];
  qualificationPreview: QualificationPreviewResult | null;
  knockoutEligibility: KnockoutEligibilityResult | null;
  id: string;
  publicId: string;
  name: string;
  game: Game;
  format: CompetitionFormat;
  status: CompetitionStatus;
  currentStage: CompetitionStage;
  revision: number;
  knockoutLegs: number;
  knockoutFinalLegs: number;
  knockoutTies: (KnockoutTie & {
    homeAggregate: number;
    awayAggregate: number;
  })[];
  legs: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  championId: string | null;
  entrants: Entrant[];
  groups: Group[];
  matches: Match[];
  rounds: Round[];
  ties: Tie[];
  qualification: Qualification | null;
};
import { createHash } from "node:crypto";
import { required } from "./required";
export type Entrant = {
  id: string;
  name: string;
  aliases: string[];
  groupId: string | null;
};
export type Group = {
  id: string;
  name: string;
  qualifierCount: number;
};
export type KnockoutTie = {
  id: string;
  roundId: string;
  slot: number;
  homeId: string;
  awayId: string;
  legs: number;
  homeTiebreak: number | null;
  awayTiebreak: number | null;
  winnerId: string | null;
};
export type Match = {
  knockoutTieId?: string | null;
  id: string;
  stage: MatchStage;
  scope: string;
  round: number;
  leg: number;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTiebreak: number | null;
  awayTiebreak: number | null;
  winnerId: string | null;
  revision: number;
};
export type Round = {
  id: string;
  number: number;
  method?: "MANUAL" | "RANDOM" | "FIXED";
  byes: (Bye & { slot?: number })[];
};
export type Tie = {
  scope: string;
  signature: string;
  order: string[];
};
export type Competition = {
  id: string;
  publicId: string;
  name: string;
  game: Game;
  format: CompetitionFormat;
  status: CompetitionStatus;
  currentStage: CompetitionStage;
  revision: number;
  knockoutLegs?: number;
  knockoutFinalLegs?: number;
  knockoutTies?: KnockoutTie[];
  legs: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  championId: string | null;
  entrants: Entrant[];
  groups: Group[];
  matches: Match[];
  rounds: Round[];
  ties: Tie[];
  qualification: Qualification | null;
};
export type Standing = {
  entrantId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scoreFor: number;
  scoreAgainst: number;
  difference: number;
  points: number;
  rank: number;
  tieSignature: string | null;
  tieResolved: boolean;
};
export function scopeEntrants(t: Competition, scope: string): Entrant[] {
  return scope === "LEAGUE"
    ? t.entrants
    : t.entrants.filter((e: Entrant): boolean => e.groupId === scope);
}
export function previewFixtures(t: Competition): ScheduledFixture[] {
  invariant(t.entrants.length >= 2, "Add at least two entrants");
  if (t.format === "KNOCKOUT") return [];
  if (t.format === "LEAGUE")
    return roundRobin(
      t.entrants.map((e: Entrant): string => e.id),
      t.legs,
    );
  invariant(t.groups.length > 0, "Create at least one group");
  invariant(
    t.entrants.every((e: Entrant): boolean =>
      t.groups.some((g: Group): boolean => g.id === e.groupId),
    ),
    "Assign every entrant to a group",
  );
  const fixtures = t.groups.flatMap((g: Group): ScheduledFixture[] => {
    const ids = scopeEntrants(t, g.id).map((e: Entrant): string => e.id);
    invariant(ids.length >= 2, `${g.name} needs at least two entrants`);
    invariant(
      g.qualifierCount >= 1 && g.qualifierCount <= ids.length,
      `Invalid qualifier count for ${g.name}`,
    );
    return roundRobin(ids, t.legs, g.id);
  });
  invariant(
    t.groups.reduce(
      (sum: number, g: Group): number => sum + g.qualifierCount,
      0,
    ) >= 2,
    "At least two teams must qualify",
  );
  return fixtures;
}
export function standings(t: Competition, scope: string): Standing[] {
  const rows = scopeEntrants(t, scope).map((e: Entrant): Standing => ({
    entrantId: e.id,
    name: e.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    difference: 0,
    points: 0,
    rank: 0,
    tieSignature: null as string | null,
    tieResolved: false,
  }));
  const byId = new Map(
    rows.map((r: Standing): [string, Standing] => [r.entrantId, r]),
  );
  for (const m of t.matches.filter(
    (m: Match): boolean =>
      m.scope === scope && m.stage !== "KNOCKOUT" && completed(m),
  )) {
    const h = required(byId.get(m.homeId)),
      a = required(byId.get(m.awayId));
    h.played++;
    a.played++;
    h.scoreFor += required(m.homeScore);
    h.scoreAgainst += required(m.awayScore);
    a.scoreFor += required(m.awayScore);
    a.scoreAgainst += required(m.homeScore);
    if (required(m.homeScore) > required(m.awayScore)) {
      h.won++;
      a.lost++;
      h.points += t.winPoints;
      a.points += t.lossPoints;
    } else if (required(m.homeScore) < required(m.awayScore)) {
      a.won++;
      h.lost++;
      a.points += t.winPoints;
      h.points += t.lossPoints;
    } else {
      h.drawn++;
      a.drawn++;
      h.points += t.drawPoints;
      a.points += t.drawPoints;
    }
  }
  for (const r of rows) r.difference = r.scoreFor - r.scoreAgainst;
  rows.sort(
    (a: Standing, b: Standing): number =>
      b.points - a.points ||
      b.difference - a.difference ||
      b.scoreFor - a.scoreFor ||
      a.name.localeCompare(b.name),
  );
  for (let i = 0; i < rows.length;) {
    let end = i + 1;
    while (
      end < rows.length &&
      rows[end].points === rows[i].points &&
      rows[end].difference === rows[i].difference &&
      rows[end].scoreFor === rows[i].scoreFor
    )
      end++;
    if (end - i > 1) {
      const bucket = rows.slice(i, end);
      const signature = createHash("sha256")
        .update(
          JSON.stringify([
            scope,
            bucket.map((r: Standing): string => r.entrantId).sort(),
            rows[i].points,
            rows[i].difference,
            rows[i].scoreFor,
          ]),
        )
        .digest("hex");
      const decision = t.ties.find(
        (d: Tie): boolean => d.scope === scope && d.signature === signature,
      );
      if (decision)
        bucket.sort(
          (a: Standing, b: Standing): number =>
            decision.order.indexOf(a.entrantId) -
            decision.order.indexOf(b.entrantId),
        );
      bucket.forEach((r: Standing): void => {
        r.tieSignature = signature;
        r.tieResolved = !!decision;
      });
      rows.splice(i, bucket.length, ...bucket);
    }
    i = end;
  }
  rows.forEach((r: Standing, i: number): void => {
    r.rank = i + 1;
  });
  return rows;
}
export function qualificationPreview(
  t: Competition,
): QualificationPreviewResult {
  invariant(t.format === "WORLD_CUP", "This is not a group tournament");
  const fixtures = t.matches.filter((m: Match): boolean => m.stage === "GROUP");
  invariant(
    fixtures.length > 0 && fixtures.every(completed),
    "Finish every group fixture before qualification",
  );
  const groups = t.groups.map((g: Group): QualificationGroup => {
    const rows = standings(t, g.id),
      selected = rows.slice(0, g.qualifierCount);
    const last = selected.at(-1),
      next = rows[g.qualifierCount];
    invariant(
      !last ||
        !next ||
        last.tieSignature !== next.tieSignature ||
        !last.tieSignature ||
        last.tieResolved,
      `Resolve the qualification tie in ${g.name}`,
    );
    return {
      groupId: g.id,
      name: g.name,
      entrantIds: selected.map((r: Standing): string => r.entrantId),
    };
  });
  const entrantIds = groups.flatMap(
    (g: QualificationGroup): string[] => g.entrantIds,
  );
  invariant(entrantIds.length >= 2, "At least two teams must qualify");
  return { groups, entrantIds };
}
export function knockoutEligibility(t: Competition): KnockoutEligibilityResult {
  invariant(t.status !== "DRAFT", "Start the tournament first");
  invariant(
    t.format === "KNOCKOUT" || t.qualification,
    "Confirm group qualification first",
  );
  const last = [...t.rounds].sort(
    (a: Round, b: Round): number => b.number - a.number,
  )[0];
  if (!last)
    return {
      round: 1,
      entrantIds:
        t.format === "KNOCKOUT"
          ? t.entrants.map((e: Entrant): string => e.id)
          : required(t.qualification).entrantIds,
      byeCount:
        2 **
          Math.ceil(
            Math.log2(
              t.format === "KNOCKOUT"
                ? t.entrants.length
                : required(t.qualification).entrantIds.length,
            ),
          ) -
        (t.format === "KNOCKOUT"
          ? t.entrants.length
          : required(t.qualification).entrantIds.length),
    };
  const ties = (t.knockoutTies ?? []).filter(
    (tie: KnockoutTie): boolean => tie.roundId === last.id,
  );
  if (ties.length) {
    invariant(
      ties.every((tie: KnockoutTie): boolean => !!tie.winnerId),
      "Finish this knockout round before creating the next",
    );
    const ids = [
      ...ties.map((tie: KnockoutTie): { slot: number; id: string } => ({
        slot: tie.slot,
        id: required(tie.winnerId),
      })),
      ...last.byes.map(
        (b: Bye & { slot?: number }): { slot: number; id: string } => ({
          slot: b.slot ?? 0,
          id: b.entrantId,
        }),
      ),
    ]
      .sort(
        (a: { slot: number }, b: { slot: number }): number => a.slot - b.slot,
      )
      .map((x: { id: string }): string => x.id);
    invariant(ids.length > 1, "The final has already been played");
    return { round: last.number + 1, entrantIds: ids, byeCount: 0 };
  }
  const matches = t.matches.filter(
    (m: Match): boolean => m.stage === "KNOCKOUT" && m.round === last.number,
  );
  invariant(
    matches.every(
      (m: Match): string | false | null => completed(m) && m.winnerId,
    ),
    "Finish this knockout round before creating the next",
  );
  const ids = [
    ...last.byes.map((b: Bye): string => b.entrantId),
    ...matches.map((m: Match): string => required(m.winnerId)),
  ];
  invariant(ids.length > 1, "The final has already been played");
  return { round: last.number + 1, entrantIds: ids, byeCount: 0 };
}
export function validatePairings(
  eligible: ReturnType<typeof knockoutEligibility>,
  pairs: string[][],
  byes: string[],
): void {
  invariant(
    byes.length === eligible.byeCount,
    `Assign exactly ${eligible.byeCount} byes`,
  );
  invariant(
    pairs.every((p: string[]): boolean => p.length === 2 && p[0] !== p[1]),
    "Each match needs two different entrants",
  );
  const all = [...byes, ...pairs.flat()];
  invariant(
    all.length === eligible.entrantIds.length &&
      new Set(all).size === all.length &&
      all.every((id: string): boolean => eligible.entrantIds.includes(id)),
    "Use every eligible entrant exactly once",
  );
}
export type Score = {
  homeScore: number | null;
  awayScore: number | null;
  homeTiebreak?: number | null;
  awayTiebreak?: number | null;
  winnerId?: string | null;
};
export function validateScore(m: Match, score: Score): ValidateScoreResult {
  const { homeScore: h, awayScore: a } = score;
  invariant((h === null) === (a === null), "Enter both scores or clear both");
  const valid = (n: number | null | undefined): boolean =>
    n == null || (Number.isInteger(n) && n >= 0 && n <= 2147483647);
  invariant(
    [h, a, score.homeTiebreak, score.awayTiebreak].every(valid),
    "Scores must be non-negative integers",
  );
  if (h === null)
    return {
      homeScore: null,
      awayScore: null,
      homeTiebreak: null,
      awayTiebreak: null,
      winnerId: null,
    };
  const hb = score.homeTiebreak ?? null,
    ab = score.awayTiebreak ?? null;
  invariant((hb === null) === (ab === null), "Enter both tiebreak scores");
  invariant(
    h === a || hb === null,
    "Tiebreaks are only allowed for tied scores",
  );
  invariant(
    m.stage === "KNOCKOUT" || hb === null,
    "Tiebreaks apply only to knockout matches",
  );
  let winner =
    required(h) > required(a)
      ? m.homeId
      : required(h) < required(a)
        ? m.awayId
        : null;
  if (m.stage === "KNOCKOUT" && h === a) {
    if (hb !== null) {
      invariant(hb !== ab, "Tiebreak scores must decide a winner");
      winner = hb > required(ab) ? m.homeId : m.awayId;
    } else winner = score.winnerId ?? null;
    invariant(
      winner === m.homeId || winner === m.awayId,
      "Choose a winner for this tied knockout match",
    );
  }
  if (score.winnerId)
    invariant(
      score.winnerId === winner,
      "Selected winner contradicts the scores",
    );
  return {
    homeScore: h,
    awayScore: a,
    homeTiebreak: hb,
    awayTiebreak: ab,
    winnerId: winner,
  };
}
export function correctionImpact(
  t: Competition,
  m: Match,
  score: ValidateScoreResult,
  tie?: KnockoutTie,
): CorrectionImpactResult {
  const simulated = {
    ...t,
    matches: t.matches.map((x: Match): Match =>
      x.id === m.id ? { ...x, ...score } : x,
    ),
    ties: t.ties.filter(
      (d: Tie): boolean =>
        d.scope !== m.scope ||
        (m.homeScore === score.homeScore && m.awayScore === score.awayScore),
    ),
  };
  let resetRounds: Round[] = [],
    reason: string | null = null;
  if (m.stage === "GROUP" && t.qualification) {
    try {
      const ids = qualificationPreview(simulated).entrantIds;
      if (
        JSON.stringify([...ids].sort()) !==
        JSON.stringify([...t.qualification.entrantIds].sort())
      )
        reason = "Qualification changes; the knockout stage must be rebuilt.";
    } catch {
      reason =
        "Qualification becomes incomplete or unresolved; the knockout stage must be rebuilt.";
    }
    if (reason) resetRounds = t.rounds;
  } else if (
    m.stage === "KNOCKOUT" &&
    (tie
      ? (t.knockoutTies ?? []).find(
          (x: KnockoutTie): boolean => x.id === tie.id,
        )?.winnerId !== tie.winnerId
      : m.winnerId !== score.winnerId)
  ) {
    resetRounds = t.rounds.filter((r: Round): boolean => r.number > m.round);
    if (resetRounds.length)
      reason =
        "The advancing team changes; subsequent knockout rounds must be rebuilt.";
  }
  return {
    requiresReset: !!reason,
    reason,
    roundIds: resetRounds.map((r: Round): string => r.id),
    matchIds: t.matches
      .filter(
        (x: Match): boolean =>
          x.stage === "KNOCKOUT" &&
          resetRounds.some((r: Round): boolean => r.number === x.round),
      )
      .map((x: Match): string => x.id),
    resetQualification: m.stage === "GROUP" && !!reason,
  };
}
export function completion(t: Competition): CompletionResult {
  if (t.status === "DRAFT") return { status: "DRAFT", championId: null };
  if (t.format === "LEAGUE") {
    if (!t.matches.length || !t.matches.every(completed))
      return { status: "ACTIVE", championId: null };
    const rows = standings(t, "LEAGUE"),
      top = rows[0];
    if (top.tieSignature && !top.tieResolved)
      return { status: "ACTIVE", championId: null };
    return { status: "COMPLETED", championId: top.entrantId };
  }
  const last = [...t.rounds].sort(
    (a: Round, b: Round): number => b.number - a.number,
  )[0];
  if (last) {
    const ties = (t.knockoutTies ?? []).filter(
      (tie: KnockoutTie): boolean => tie.roundId === last.id,
    );
    if (ties.length)
      return ties.length === 1 && !last.byes.length && ties[0].winnerId
        ? { status: "COMPLETED", championId: ties[0].winnerId }
        : { status: "ACTIVE", championId: null };
    const matches = t.matches.filter(
      (m: Match): boolean => m.stage === "KNOCKOUT" && m.round === last.number,
    );
    if (
      matches.length === 1 &&
      !last.byes.length &&
      completed(matches[0]) &&
      matches[0].winnerId
    )
      return { status: "COMPLETED", championId: matches[0].winnerId };
  }
  return { status: "ACTIVE", championId: null };
}
export function tournamentView(t: Competition): TournamentViewResult {
  const scopes =
    t.format === "LEAGUE"
      ? ["LEAGUE"]
      : t.groups.map((g: Group): string => g.id);
  let qualification = null,
    eligibility = null;
  try {
    if (t.format === "WORLD_CUP") qualification = qualificationPreview(t);
  } catch {}
  try {
    if (t.qualification || t.format === "KNOCKOUT")
      eligibility = knockoutEligibility(t);
  } catch {}
  return {
    ...t,
    knockoutLegs: t.knockoutLegs ?? 1,
    knockoutFinalLegs: t.knockoutFinalLegs ?? 1,
    knockoutTies: (t.knockoutTies ?? []).map(
      (
        tie: KnockoutTie,
      ): KnockoutTie & { homeAggregate: number; awayAggregate: number } => ({
        ...tie,
        ...aggregateOutcome(tie, t.matches),
        winnerId: tie.winnerId,
      }),
    ),
    standings: scopes.map((scope: string): ScopeStanding => ({
      scope,
      rows: standings(t, scope),
    })),
    qualificationPreview: qualification,
    knockoutEligibility: eligibility,
  };
}
