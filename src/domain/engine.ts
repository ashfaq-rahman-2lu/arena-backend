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
export type Match = {
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
  byes: Bye[];
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
export class RuleError extends Error {}
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new RuleError(message);
}
export function completed(m: Match): boolean {
  return m.homeScore !== null && m.awayScore !== null;
}
export function scopeEntrants(t: Competition, scope: string): Entrant[] {
  return scope === "LEAGUE"
    ? t.entrants
    : t.entrants.filter((e: Entrant): boolean => e.groupId === scope);
}
export function pairingKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}
// Circle method: one idle entrant per round for odd-sized fields; all rounds are informational.
export function roundRobin(
  ids: string[],
  legs: number,
  scope: string = "LEAGUE",
): ScheduledFixture[] {
  invariant(new Set(ids).size === ids.length, "Duplicate entrants");
  invariant(ids.length >= 2, "At least two entrants are required");
  invariant(legs === 1 || legs === 2, "Choose one or two legs");
  const ring: (string | null)[] = [...ids];
  if (ring.length % 2) ring.push(null);
  const fixtures: ScheduledFixture[] = [];
  for (let r = 0; r < ring.length - 1; r++) {
    for (let i = 0; i < ring.length / 2; i++) {
      let a = ring[i],
        b = ring[ring.length - 1 - i];
      if (!a || !b) continue;
      if ((r + i) % 2) [a, b] = [b, a];
      fixtures.push({
        homeId: a,
        awayId: b,
        round: r + 1,
        leg: 1,
        scope,
        pairingKey: pairingKey(a, b),
      });
      if (legs === 2)
        fixtures.push({
          homeId: b,
          awayId: a,
          round: r + ring.length,
          leg: 2,
          scope,
          pairingKey: pairingKey(a, b),
        });
    }
    const last = ring.pop();
    if (last === undefined) throw new RuleError("Fixture ring is empty");
    ring.splice(1, 0, last);
  }
  return fixtures.sort(
    (a: ScheduledFixture, b: ScheduledFixture): number => a.round - b.round,
  );
}
export function previewFixtures(t: Competition): ScheduledFixture[] {
  invariant(t.entrants.length >= 2, "Add at least two entrants");
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
  invariant(t.qualification, "Confirm group qualification first");
  const last = [...t.rounds].sort(
    (a: Round, b: Round): number => b.number - a.number,
  )[0];
  if (!last)
    return {
      round: 1,
      entrantIds: t.qualification.entrantIds,
      byeCount:
        2 ** Math.ceil(Math.log2(t.qualification.entrantIds.length)) -
        t.qualification.entrantIds.length,
    };
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
  } else if (m.stage === "KNOCKOUT" && m.winnerId !== score.winnerId) {
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
    if (t.qualification) eligibility = knockoutEligibility(t);
  } catch {}
  return {
    ...t,
    standings: scopes.map((scope: string): ScopeStanding => ({
      scope,
      rows: standings(t, scope),
    })),
    qualificationPreview: qualification,
    knockoutEligibility: eligibility,
  };
}
