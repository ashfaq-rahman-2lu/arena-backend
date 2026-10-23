import { INestApplication } from "@nestjs/common";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Server as HttpServer } from "node:http";
import { Server } from "node:net";
import { afterEach, before, beforeEach, test } from "node:test";
import sharp from "sharp";
import request, {
  Response as RequestResponse,
  Test as RequestTest,
} from "supertest";
import { createApp } from "../../src/app";
import { SessionView } from "../../src/auth/auth-response.dto";
import { EmailMessage } from "../../src/auth/auth.models";
import { EmailPort } from "../../src/auth/smtp-email.adapter";
import { ApiError } from "../../src/common/api-error.dto";
import { ApplicationError } from "../../src/common/application-error";
import { HttpTransport } from "../../src/common/fetch-http.adapter";
import { DatabaseService as Db } from "../../src/database/database.service";
import { required } from "../../src/domain/required";
import { ExtractionSuggestion } from "../../src/extraction/extraction-response.dto";
import { VisionProvider } from "../../src/extraction/extraction.models";
import { CorrectionImpact } from "../../src/matches/match-response.dto";
import {
  Entrant,
  FixturePage,
  HistoryEntry,
  HistoryPage,
  Match,
  TournamentPage,
  TournamentView,
} from "../../src/tournaments/tournament-response.dto";
import { readResponse } from "../response-fixture";
function httpServer(application: INestApplication): HttpServer {
  const server: unknown = application.getHttpServer();
  if (!(server instanceof HttpServer))
    throw new Error("Unexpected HTTP server");
  return server as HttpServer;
}
let emailFailure = false;
let profile = {
  sub: "google-new",
  email: "google@example.test",
  email_verified: true,
  name: "Google admin",
};
const fakeEmail: EmailPort = {
  send: async (message: EmailMessage): Promise<void> => {
    if (emailFailure)
      throw new ApplicationError(
        "INTEGRATION_UNAVAILABLE",
        503,
        "Could not deliver email. Please retry.",
      );
    messages.push(message.text);
  },
};
const fakeHttp: HttpTransport = {
  send: async (url: string, _options: RequestInit): Promise<Response> =>
    new Response(
      JSON.stringify(
        url.includes("/token") ? { access_token: "test-token" } : profile,
      ),
      { status: 200 },
    ),
};
const fakeVision: VisionProvider = {
  read: async (
    _image: Buffer,
    _entrants: Entrant[],
  ): Promise<import("../../src/extraction/extraction.models").Extracted> => ({
    sides: [
      { name: null, score: 4, tiebreak: null },
      { name: "Unrelated team", score: 1, tiebreak: null },
    ],
    stats: [
      { key: "passes", label: "Passes", home: 115, away: 79, unit: "count" },
    ],
    warnings: [],
  }),
};
let app: INestApplication, db: Db, smtp: Server;
const messages: string[] = [];
type Agent = ReturnType<typeof request.agent>;
let admin: Agent,
  other: Agent,
  guest: Agent,
  csrf = "",
  otherCsrf = "";
const base = "/api/v1";
const initial = {
  name: "Integration league",
  game: "EFOOTBALL",
  format: "LEAGUE",
  legs: 1,
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  groups: [],
  entrants: ["Alpha", "Beta", "Gamma", "Delta"].map(
    (
      name: string,
    ): {
      name: string;
      aliases: never[];
    } => ({
      name,
      aliases: [],
    }),
  ),
};
const send = (
  agent: Agent,
  method: "post" | "patch",
  path: string,
  body: unknown,
  token: string = csrf,
): RequestTest =>
  agent[method](base + path)
    .set("X-CSRF-Token", token)
    .set("Origin", required(process.env.FRONTEND_URL))
    .send(body as object);
const session = async (agent: Agent): Promise<string> => {
  const res = await agent.get(base + "/auth/session").expect(200);
  return readResponse<SessionView>(res, "SessionView").csrf as string;
};
async function login(
  agent: Agent,
  email: string,
  password: string = "correct-horse-123",
): Promise<string> {
  const token = await session(agent);
  await send(agent, "post", "/auth/login", { email, password }, token).expect(
    201,
  );
  return session(agent);
}
async function create(
  agent: Agent = admin,
  body: unknown = initial,
  token: string = csrf,
): Promise<TournamentView> {
  return readResponse<TournamentView>(
    await send(agent, "post", "/tournaments", body, token).expect(201),
    "TournamentView",
  );
}
async function start(t: TournamentView): Promise<TournamentView> {
  return readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/start`, {
      expectedRevision: t.revision,
    }).expect(201),
    "TournamentView",
  );
}
function score(
  t: TournamentView,
  m: Match,
  h: number | null,
  a: number | null,
  extra: object = {},
): RequestTest {
  return send(admin, "patch", `/matches/${m.id}/result`, {
    homeScore: h,
    awayScore: a,
    expectedRevision: m.revision,
    expectedTournamentRevision: t.revision,
    ...extra,
  });
}
before(async (): Promise<void> => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error(
      "Set TEST_DATABASE_URL to a dedicated database whose name ends in _test",
    );
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = "test";
  process.env.AUTH_RATE_LIMIT = "1000";
  process.env.SESSION_SECRET =
    "integration-secret-at-least-thirty-two-characters";
  process.env.FRONTEND_URL = "http://localhost:5173";
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { cwd: process.cwd(), env: process.env, stdio: "pipe" },
  );
});
beforeEach(async (): Promise<void> => {
  messages.length = 0;
  emailFailure = false;
  profile = {
    sub: "google-new",
    email: "google@example.test",
    email_verified: true,
    name: "Google admin",
  };
  const environment = {
    ...process.env,
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_CALLBACK_URL: "http://localhost:5173/api/v1/auth/google/callback",
  };
  app = await createApp({
    environment,
    email: fakeEmail,
    http: fakeHttp,
    vision: fakeVision,
  });
  await app.init();
  db = app.get(Db);
  // Clear rounds first so bye references cannot restrict the entrant cascade on repeated runs.
  await db.$transaction([
    db.round.deleteMany(),
    db.tournament.deleteMany(),
    required(db.user).deleteMany(),
  ]);
  admin = request.agent(httpServer(app));
  other = request.agent(httpServer(app));
  guest = request.agent(httpServer(app));
  for (const [agent, email] of [
    [admin, "admin@example.test"],
    [other, "other@example.test"],
  ] as const) {
    const c = await session(agent);
    await send(
      agent,
      "post",
      "/auth/register",
      { name: email.split("@")[0], email, password: "correct-horse-123" },
      c,
    ).expect(201);
    const token = required(
      required(messages.at(-1)).match(/token=([a-f0-9]{64})/),
    )[1];
    await send(agent, "post", "/auth/verify", { token }, c).expect(201);
  }
  csrf = await login(admin, "admin@example.test");
  otherCsrf = await login(other, "other@example.test");
});
afterEach(async (): Promise<void> => {
  await app?.close();
});
test("registration requires verification, delivers mail, and tokens are single-use", async (): Promise<void> => {
  const c = await session(guest);
  await send(
    guest,
    "post",
    "/auth/register",
    {
      name: "New admin",
      email: "new@example.test",
      password: "correct-horse-123",
    },
    c,
  ).expect(201);
  await send(
    guest,
    "post",
    "/auth/login",
    { email: "new@example.test", password: "correct-horse-123" },
    c,
  ).expect(403);
  const token = required(
    required(messages.at(-1)).match(/token=([a-f0-9]{64})/),
  )[1];
  await send(guest, "post", "/auth/verify", { token }, c).expect(201);
  await send(guest, "post", "/auth/verify", { token }, c).expect(400);
});
test("public viewers cannot edit; another admin cannot edit or see audit records", async (): Promise<void> => {
  const t = await create();
  const res = await guest
    .get(`${base}/public/tournaments/${t.publicId.toLowerCase()}`)
    .expect(200);
  assert.equal(
    readResponse<TournamentView>(res, "TournamentView").name,
    t.name,
  );
  for (const key of ["ownerId", "owner", "history", "email", "passwordHash"])
    assert.equal(
      Reflect.get(readResponse<TournamentView>(res, "TournamentView"), key),
      undefined,
    );
  await guest.get(`${base}/tournaments/${t.id}`).expect(401);
  await send(
    guest,
    "post",
    `/tournaments/${t.id}/start`,
    { expectedRevision: 0 },
    await session(guest),
  ).expect(401);
  await send(
    other,
    "post",
    `/tournaments/${t.id}/start`,
    { expectedRevision: 0 },
    otherCsrf,
  ).expect(403);
  await other.get(`${base}/tournaments/${t.id}/history`).expect(403);
  await request(httpServer(app))
    .post(base + "/auth/login")
    .send({ email: "admin@example.test", password: "correct-horse-123" })
    .expect(403);
});
test("starting is atomic, fixtures are unique, setup locks, and a league completes", async (): Promise<void> => {
  let t = await create();
  const preview = await admin
    .get(`${base}/tournaments/${t.id}/fixture-preview`)
    .expect(200);
  assert.equal(
    readResponse<FixturePage>(preview, "FixturePage").items.length,
    6,
  );
  const results = await Promise.all([
    send(admin, "post", `/tournaments/${t.id}/start`, { expectedRevision: 0 }),
    send(admin, "post", `/tournaments/${t.id}/start`, { expectedRevision: 0 }),
  ]);
  assert.deepEqual(
    results.map((r: RequestResponse): number => r.status).sort(),
    [201, 409],
  );
  t = readResponse<TournamentView>(
    required(
      required(results.find((r: RequestResponse): boolean => r.status === 201)),
    ),
    "TournamentView",
  );
  assert.equal(t.matches.length, 6);
  await send(admin, "patch", `/tournaments/${t.id}`, {
    ...initial,
    expectedRevision: t.revision,
  }).expect(400);
  for (const original of [...t.matches].reverse()) {
    const m = required(
      t.matches.find((m: Match): boolean => m.id === original.id),
    );
    const hi = t.entrants.findIndex((e: Entrant): boolean => e.id === m.homeId),
      ai = t.entrants.findIndex((e: Entrant): boolean => e.id === m.awayId);
    t = readResponse<TournamentView>(
      await score(t, m, hi < ai ? 2 : 0, hi < ai ? 0 : 2).expect(200),
      "TournamentView",
    );
  }
  assert.equal(t.status, "COMPLETED");
  assert.equal(t.championId, t.entrants[0].id);
  assert.equal(
    readResponse<HistoryPage>(
      await admin.get(`${base}/tournaments/${t.id}/history`).expect(200),
      "HistoryPage",
    ).items.length,
    6,
  );
  const old = t.matches[0],
    clear = await score(t, old, null, null).expect(200);
  assert.equal(
    readResponse<TournamentView>(clear, "TournamentView").status,
    "ACTIVE",
  );
  assert.equal(
    readResponse<TournamentView>(clear, "TournamentView").championId,
    null,
  );
});
test("stale edits and concurrent saves cannot overwrite each other", async (): Promise<void> => {
  const t = await start(await create()),
    m = t.matches[0];
  const responses = await Promise.all([score(t, m, 1, 0), score(t, m, 0, 2)]);
  assert.deepEqual(
    responses.map((r: RequestResponse): number => r.status).sort(),
    [200, 409],
  );
  await score(t, m, 3, 1).expect(409);
  const fresh = readResponse<TournamentView>(
    await admin.get(`${base}/tournaments/${t.id}`),
    "TournamentView",
  );
  assert.equal(
    required(fresh.matches.find((x: Match): boolean => x.id === m.id)).revision,
    1,
  );
});
test("six qualifiers get two byes, manual knockout rounds and a champion", async (): Promise<void> => {
  let t = await create(admin, {
    ...initial,
    name: "Cup with byes",
    format: "WORLD_CUP",
    groups: [
      { name: "A", qualifierCount: 3 },
      { name: "B", qualifierCount: 3 },
    ],
    entrants: ["A1", "A2", "A3", "B1", "B2", "B3"].map(
      (
        name: string,
        i: number,
      ): {
        name: string;
        aliases: never[];
        groupIndex: number;
      } => ({
        name,
        aliases: [],
        groupIndex: i < 3 ? 0 : 1,
      }),
    ),
  });
  t = await start(t);
  await send(admin, "post", `/tournaments/${t.id}/qualification`, {
    expectedRevision: t.revision,
  }).expect(400);
  for (const original of [...t.matches])
    t = readResponse<TournamentView>(
      await score(
        t,
        required(t.matches.find((x: Match): boolean => x.id === original.id)),
        1,
        1,
      ).expect(200),
      "TournamentView",
    );
  assert.equal(required(t.qualificationPreview).entrantIds.length, 6);
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/qualification`, {
      expectedRevision: t.revision,
    }).expect(201),
    "TournamentView",
  );
  while (t.status !== "COMPLETED") {
    const e = t.knockoutEligibility;
    assert(e);
    const byes = e.entrantIds.slice(0, e.byeCount),
      others = e.entrantIds.slice(e.byeCount),
      pairs = [];
    for (let i = 0; i < others.length; i += 2)
      pairs.push([others[i], others[i + 1]]);
    t = readResponse<TournamentView>(
      await send(admin, "post", `/tournaments/${t.id}/rounds`, {
        expectedRevision: t.revision,
        pairs,
        byes,
      }).expect(201),
      "TournamentView",
    );
    if (e.round === 1) {
      assert.equal(t.rounds[0].byes.length, 2);
      assert.equal(
        t.matches.filter((m: Match): boolean => m.stage === "KNOCKOUT").length,
        2,
      );
    }
    await send(admin, "post", `/tournaments/${t.id}/rounds`, {
      expectedRevision: t.revision,
      pairs,
      byes: [],
    }).expect(400);
    for (const original of t.matches.filter(
      (m: Match): boolean => m.stage === "KNOCKOUT" && m.round === e.round,
    ))
      t = readResponse<TournamentView>(
        await score(
          t,
          required(t.matches.find((m: Match): boolean => m.id === original.id)),
          2,
          0,
        ).expect(200),
        "TournamentView",
      );
  }
  assert(t.championId);
  assert.equal(t.rounds.length, 3);
});
test("changed qualification requires a revision-bound preview, resets atomically and keeps history", async (): Promise<void> => {
  let t = await create(admin, {
    ...initial,
    name: "Correction cup",
    format: "WORLD_CUP",
    groups: [
      { name: "A", qualifierCount: 1 },
      { name: "B", qualifierCount: 1 },
    ],
    entrants: ["A1", "A2", "B1", "B2"].map(
      (
        name: string,
        i: number,
      ): {
        name: string;
        aliases: never[];
        groupIndex: number;
      } => ({
        name,
        aliases: [],
        groupIndex: i < 2 ? 0 : 1,
      }),
    ),
  });
  t = await start(t);
  for (const original of [...t.matches])
    t = readResponse<TournamentView>(
      await score(
        t,
        required(t.matches.find((m: Match): boolean => m.id === original.id)),
        2,
        0,
      ).expect(200),
      "TournamentView",
    );
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/qualification`, {
      expectedRevision: t.revision,
    }).expect(201),
    "TournamentView",
  );
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/rounds`, {
      expectedRevision: t.revision,
      pairs: [required(t.qualification).entrantIds],
      byes: [],
    }).expect(201),
    "TournamentView",
  );
  const group = required(
    t.matches.find((m: Match): boolean => m.stage === "GROUP"),
  );
  const body = {
    homeScore: 0,
    awayScore: 3,
    expectedRevision: group.revision,
    expectedTournamentRevision: t.revision,
  };
  const preview = readResponse<CorrectionImpact>(
    await send(
      admin,
      "post",
      `/matches/${group.id}/correction-preview`,
      body,
    ).expect(201),
    "CorrectionImpact",
  );
  assert.equal(preview.requiresReset, true);
  assert.equal(preview.matchIds.length, 1);
  await score(t, group, 0, 3).expect(409);
  t = readResponse<TournamentView>(
    await score(t, group, 0, 3, {
      confirmReset: true,
      impactToken: preview.impactToken,
    }).expect(200),
    "TournamentView",
  );
  assert.equal(t.qualification, null);
  assert.equal(t.rounds.length, 0);
  assert.equal(t.currentStage, "GROUP");
  assert.equal(
    t.matches.filter((m: Match): boolean => m.stage === "KNOCKOUT").length,
    0,
  );
  assert(
    readResponse<HistoryPage>(
      await admin.get(`${base}/tournaments/${t.id}/history`),
      "HistoryPage",
    ).items.some((h: HistoryEntry): boolean => h.action === "RESET"),
  );
});
test("extraction checks ownership, rejects invalid uploads, and does not persist scores", async (): Promise<void> => {
  const t = await start(await create()),
    m = t.matches[0];
  const image = await sharp({
    create: { width: 50, height: 50, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  try {
    await other
      .post(`${base}/matches/${m.id}/extract-score`)
      .set("X-CSRF-Token", otherCsrf)
      .attach("image", image, "score.png")
      .expect(403);
    const result = await admin
      .post(`${base}/matches/${m.id}/extract-score`)
      .set("X-CSRF-Token", csrf)
      .attach("image", image, "score.png")
      .expect(201);
    assert.equal(
      readResponse<ExtractionSuggestion>(result, "ExtractionSuggestion")
        .homeScore,
      4,
    );
    assert.deepEqual(
      readResponse<ExtractionSuggestion>(result, "ExtractionSuggestion").stats,
      [{ key: "passes", label: "Passes", home: 115, away: 79, unit: "count" }],
    );
    assert.equal(
      required(await db.match.findUnique({ where: { id: m.id } })).homeScore,
      null,
    );
    await admin
      .post(`${base}/matches/${m.id}/extract-score`)
      .set("X-CSRF-Token", csrf)
      .attach("image", Buffer.from("invalid"), "score.png")
      .expect(400);
  } finally {
  }
});
test("knockout corrections preserve winners, reject stale previews, and reset only later rounds", async (): Promise<void> => {
  let t = await create(admin, {
    ...initial,
    name: "Knockout correction cup",
    format: "WORLD_CUP",
    groups: [{ name: "All", qualifierCount: 4 }],
    entrants: initial.entrants.map(
      (e: {
        name: string;
        aliases: never[];
      }): {
        groupIndex: number;
        name: string;
        aliases: never[];
      } => ({ ...e, groupIndex: 0 }),
    ),
  });
  t = await start(t);
  for (const original of [...t.matches])
    t = readResponse<TournamentView>(
      await score(
        t,
        required(t.matches.find((m: Match): boolean => m.id === original.id)),
        1,
        1,
      ).expect(200),
      "TournamentView",
    );
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/qualification`, {
      expectedRevision: t.revision,
    }).expect(201),
    "TournamentView",
  );
  const ids = required(t.qualification).entrantIds;
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/rounds`, {
      expectedRevision: t.revision,
      pairs: [
        [ids[0], ids[1]],
        [ids[2], ids[3]],
      ],
      byes: [],
    }).expect(201),
    "TournamentView",
  );
  for (const original of t.matches.filter(
    (m: Match): boolean => m.stage === "KNOCKOUT",
  ))
    t = readResponse<TournamentView>(
      await score(
        t,
        required(t.matches.find((m: Match): boolean => m.id === original.id)),
        2,
        0,
      ).expect(200),
      "TournamentView",
    );
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/rounds`, {
      expectedRevision: t.revision,
      pairs: [required(t.knockoutEligibility).entrantIds],
      byes: [],
    }).expect(201),
    "TournamentView",
  );
  const finalId = required(
    t.matches.find(
      (m: Match): boolean => m.stage === "KNOCKOUT" && m.round === 2,
    ),
  ).id;
  t = readResponse<TournamentView>(
    await score(
      t,
      required(t.matches.find((m: Match): boolean => m.id === finalId)),
      3,
      1,
    ).expect(200),
    "TournamentView",
  );
  let early = required(
    t.matches.find(
      (m: Match): boolean => m.stage === "KNOCKOUT" && m.round === 1,
    ),
  );
  t = readResponse<TournamentView>(
    await score(t, early, 3, 0).expect(200),
    "TournamentView",
  );
  assert.equal(t.status, "COMPLETED");
  assert(t.matches.some((m: Match): boolean => m.id === finalId));
  early = required(t.matches.find((m: Match): boolean => m.id === early.id));
  const previewBody = {
    homeScore: 0,
    awayScore: 2,
    expectedRevision: early.revision,
    expectedTournamentRevision: t.revision,
  };
  const stale = readResponse<CorrectionImpact>(
    await send(
      admin,
      "post",
      `/matches/${early.id}/correction-preview`,
      previewBody,
    ).expect(201),
    "CorrectionImpact",
  );
  assert.deepEqual(stale.matchIds, [finalId]);
  t = readResponse<TournamentView>(
    await score(t, early, 4, 0).expect(200),
    "TournamentView",
  );
  early = required(t.matches.find((m: Match): boolean => m.id === early.id));
  await score(t, early, 0, 2, {
    confirmReset: true,
    impactToken: stale.impactToken,
  }).expect(409);
  const fresh = readResponse<CorrectionImpact>(
    await send(admin, "post", `/matches/${early.id}/correction-preview`, {
      ...previewBody,
      expectedRevision: early.revision,
      expectedTournamentRevision: t.revision,
    }).expect(201),
    "CorrectionImpact",
  );
  t = readResponse<TournamentView>(
    await score(t, early, 0, 2, {
      confirmReset: true,
      impactToken: fresh.impactToken,
    }).expect(200),
    "TournamentView",
  );
  assert.equal(t.status, "ACTIVE");
  assert.equal(t.championId, null);
  assert.equal(t.rounds.length, 1);
  assert(!t.matches.some((m: Match): boolean => m.id === finalId));
  assert(t.qualification);
  assert.equal(required(t.knockoutEligibility).entrantIds.length, 2);
});
test("password resets deliver mail, are single-use and revoke sessions", async (): Promise<void> => {
  const user = request.agent(httpServer(app)),
    c = await session(user);
  await send(
    user,
    "post",
    "/auth/forgot-password",
    { email: "other@example.test" },
    c,
  ).expect(201);
  const token = required(
    required(messages.at(-1)).match(/token=([a-f0-9]{64})/),
  )[1];
  await send(
    user,
    "post",
    "/auth/reset-password",
    { token, password: "replacement-pass-123" },
    c,
  ).expect(201);
  await send(
    user,
    "post",
    "/auth/reset-password",
    { token, password: "replacement-pass-123" },
    c,
  ).expect(400);
  await other.get(base + "/tournaments").expect(401);
  otherCsrf = await login(other, "other@example.test", "replacement-pass-123");
});
test("Google sign-in and linking require validated state and never link by email alone", async (): Promise<void> => {
  try {
    const google = request.agent(httpServer(app));
    let start = await google.get(base + "/auth/google").expect(302);
    let state = new URL(start.headers.location).searchParams.get("state");
    const invalidState = await google
      .get(base + "/auth/google/callback")
      .query({
        state: "0".repeat(64),
        code: "code",
        scope: "openid email profile",
        authuser: "0",
        prompt: "consent",
      })
      .expect(400);
    assert.equal(
      readResponse<ApiError>(invalidState, "ApiError").code,
      "OAUTH_INVALID",
    );
    start = await google.get(base + "/auth/google").expect(302);
    state = new URL(start.headers.location).searchParams.get("state");
    await google
      .get(base + "/auth/google/callback")
      .query({
        state,
        code: "code",
        scope: "openid email profile",
        authuser: "0",
        prompt: "consent",
      })
      .expect(302);
    assert.equal(
      required(
        readResponse<SessionView>(
          await google.get(base + "/auth/session"),
          "SessionView",
        ).user,
      ).email,
      "google@example.test",
    );
    profile = {
      ...profile,
      sub: "google-existing-email",
      email: "admin@example.test",
    };
    const unlinked = request.agent(httpServer(app));
    start = await unlinked.get(base + "/auth/google").expect(302);
    state = new URL(start.headers.location).searchParams.get("state");
    await unlinked
      .get(base + "/auth/google/callback")
      .query({ state, code: "code" })
      .expect(400);
    start = await admin
      .get(base + "/auth/google")
      .query({ link: "1" })
      .expect(302);
    state = new URL(start.headers.location).searchParams.get("state");
    await admin
      .get(base + "/auth/google/callback")
      .query({ state, code: "code" })
      .expect(302);
    const info = readResponse<SessionView>(
      await admin.get(base + "/auth/session"),
      "SessionView",
    );
    assert.equal(required(info.user).googleLinked, true);
    csrf = info.csrf;
    await guest
      .get(base + "/auth/google")
      .query({ link: "1" })
      .expect(401);
    const googleCsrf = await session(google);
    await send(google, "post", "/auth/logout", {}, googleCsrf).expect(201);
    assert.equal(
      readResponse<SessionView>(
        await google.get(base + "/auth/session").expect(200),
        "SessionView",
      ).user,
      null,
    );
    await google.get(base + "/tournaments").expect(401);
  } finally {
  }
});
test("pagination validates bounds, filters summaries, and returns owner-wide totals", async (): Promise<void> => {
  await create(admin, { ...initial, name: "Unique needle" });
  await create(admin, { ...initial, name: "Other draft" });
  const response = await admin
    .get(`${base}/tournaments`)
    .query({ search: "Unique needle", status: "DRAFT", page: 1, limit: 1 })
    .expect(200);
  assert.equal(
    readResponse<TournamentPage>(response, "TournamentPage").items.length,
    1,
  );
  assert.equal(
    readResponse<TournamentPage>(response, "TournamentPage").total,
    1,
  );
  assert.equal(
    readResponse<TournamentPage>(response, "TournamentPage").limit,
    1,
  );
  assert(
    readResponse<TournamentPage>(response, "TournamentPage").totals
      .tournaments >= 2,
  );
  assert.equal(
    "matches" in
      readResponse<TournamentPage>(response, "TournamentPage").items[0],
    false,
  );
  assert.equal(
    readResponse<TournamentPage>(response, "TournamentPage").items[0]
      .entrantCount,
    4,
  );
  await admin.get(`${base}/tournaments`).query({ limit: 101 }).expect(400);
  await admin.get(`${base}/tournaments`).query({ unexpected: 1 }).expect(400);
});
test("DTOs reject unknown and nested properties and errors have stable safe codes", async (): Promise<void> => {
  const invalid = await send(admin, "post", "/tournaments", {
    ...initial,
    ownerId: "spoof",
  }).expect(400);
  assert.equal(
    readResponse<ApiError>(invalid, "ApiError").code,
    "VALIDATION_FAILED",
  );
  await send(admin, "post", "/tournaments", {
    ...initial,
    entrants: initial.entrants.map(
      (e: (typeof initial.entrants)[number]): object => ({
        ...e,
        private: true,
      }),
    ),
  }).expect(400);
  const missing = await admin.get(`${base}/tournaments/not-a-uuid`).expect(400);
  assert.equal(
    readResponse<ApiError>(missing, "ApiError").code,
    "VALIDATION_FAILED",
  );
  const t = await create();
  const preview = await admin
    .get(`${base}/tournaments/${t.id}/fixture-preview`)
    .query({ page: 2, limit: 2 })
    .expect(200);
  assert.equal(readResponse<FixturePage>(preview, "FixturePage").total, 6);
  assert.equal(
    readResponse<FixturePage>(preview, "FixturePage").items.length,
    2,
  );
  assert.equal(readResponse<FixturePage>(preview, "FixturePage").page, 2);
  const history = await admin
    .get(`${base}/tournaments/${t.id}/history`)
    .expect(200);
  assert.deepEqual(readResponse<HistoryPage>(history, "HistoryPage"), {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  const denial = await guest.get(`${base}/tournaments/${t.id}`).expect(401);
  assert.equal(
    readResponse<ApiError>(denial, "ApiError").code,
    "UNAUTHENTICATED",
  );
});
test("database rejects cross-tournament knockout rounds and byes", async (): Promise<void> => {
  const first = await create(),
    second = await create();
  const round = await db.round.create({
    data: { tournamentId: first.id, number: 1 },
  });
  await assert.rejects(async (): Promise<void> => {
    await db.$transaction(
      async (
        tx: import("@prisma/client").Prisma.TransactionClient,
      ): Promise<void> => {
        await tx.match.create({
          data: {
            tournamentId: second.id,
            stage: "KNOCKOUT",
            scope: "KNOCKOUT",
            round: 1,
            leg: 1,
            homeId: second.entrants[0].id,
            awayId: second.entrants[1].id,
            pairingKey: "constraint-probe",
            knockoutRoundId: round.id,
          },
        });
        throw new Error("constraint did not reject");
      },
    );
  }, /Foreign key constraint/);
  await assert.rejects(async (): Promise<void> => {
    await db.$transaction(
      async (
        tx: import("@prisma/client").Prisma.TransactionClient,
      ): Promise<void> => {
        await tx.$executeRaw`INSERT INTO "Bye" (id,"tournamentId","roundId","entrantId") VALUES (${crypto.randomUUID()},${first.id},${round.id},${second.entrants[0].id})`;
        throw new Error("constraint did not reject");
      },
    );
  }, /Foreign key constraint|foreign key constraint/);
});
test("failed email delivery removes its token and allows explicit resend", async (): Promise<void> => {
  const guestToken = await session(guest);
  emailFailure = true;
  const response = await send(
    guest,
    "post",
    "/auth/register",
    {
      name: "Retry admin",
      email: "retry@example.test",
      password: "RetryArena2026!",
    },
    guestToken,
  ).expect(503);
  assert.equal(
    readResponse<ApiError>(response, "ApiError").code,
    "INTEGRATION_UNAVAILABLE",
  );
  const account = await db.user.findUniqueOrThrow({
    where: { email: "retry@example.test" },
  });
  assert.equal(await db.authToken.count({ where: { userId: account.id } }), 0);
  emailFailure = false;
  await send(
    guest,
    "post",
    "/auth/resend-verification",
    { email: account.email },
    guestToken,
  ).expect(201);
  assert.equal(await db.authToken.count({ where: { userId: account.id } }), 1);
});
test("expired verification and sessions are rejected", async (): Promise<void> => {
  const guestToken = await session(guest);
  await send(
    guest,
    "post",
    "/auth/register",
    {
      name: "Expired",
      email: "expired@example.test",
      password: "ExpiredArena2026!",
    },
    guestToken,
  ).expect(201);
  const user = await db.user.findUniqueOrThrow({
    where: { email: "expired@example.test" },
  });
  await db.authToken.updateMany({
    where: { userId: user.id },
    data: { expiresAt: new Date(0) },
  });
  const token = required(
    required(messages.at(-1)).match(/token=([a-f0-9]{64})/),
  )[1];
  await send(guest, "post", "/auth/verify", { token }, guestToken).expect(400);
  await db.session.updateMany({ data: { expiresAt: new Date(0) } });
  const expired = await admin.get(base + "/auth/session").expect(200);
  assert.equal(readResponse<SessionView>(expired, "SessionView").user, null);
});
test("configured auth rate limit applies per process and returns a safe code", async (): Promise<void> => {
  const limited = await createApp({
    environment: {
      ...process.env,
      AUTH_RATE_LIMIT: "1",
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
    email: fakeEmail,
    vision: fakeVision,
  });
  await limited.init();
  try {
    const client = request.agent(httpServer(limited));
    const token = await session(client);
    await send(
      client,
      "post",
      "/auth/forgot-password",
      { email: "absent@example.test" },
      token,
    ).expect(201);
    const response = await send(
      client,
      "post",
      "/auth/forgot-password",
      { email: "absent@example.test" },
      token,
    ).expect(429);
    assert.equal(
      readResponse<ApiError>(response, "ApiError").code,
      "RATE_LIMITED",
    );
  } finally {
    await limited.close();
  }
});

test("rename works after start and only the owner can rename", async (): Promise<void> => {
  const t = await start(await create());
  await send(
    other,
    "patch",
    `/tournaments/${t.id}/name`,
    { name: "Renamed", expectedRevision: t.revision },
    otherCsrf,
  ).expect(403);
  const updated = readResponse<TournamentView>(
    await send(admin, "patch", `/tournaments/${t.id}/name`, {
      name: "Renamed",
      expectedRevision: t.revision,
    }).expect(200),
    "TournamentView",
  );
  assert.equal(updated.name, "Renamed");
  assert.deepEqual(updated.matches, t.matches);
  await send(admin, "patch", `/tournaments/${t.id}/name`, {
    name: "Stale",
    expectedRevision: t.revision,
  }).expect(409);
});
test("batch addition preserves league fixtures and generates all new pairs atomically", async (): Promise<void> => {
  const t = await start(await create());
  const updated = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/entrants`, {
      expectedRevision: t.revision,
      entrants: [
        { name: "Echo", aliases: [] },
        { name: "Foxtrot", aliases: [] },
      ],
    }).expect(201),
    "TournamentView",
  );
  assert.equal(updated.entrants.length, 6);
  assert.equal(updated.matches.length, 15);
  assert.deepEqual(
    updated.matches.filter((m: Match): boolean =>
      t.matches.some((old: Match): boolean => old.id === m.id),
    ),
    t.matches,
  );
  await send(admin, "post", `/tournaments/${t.id}/entrants`, {
    expectedRevision: updated.revision,
    entrants: [
      { name: "ECHO", aliases: [] },
      { name: "Golf", aliases: [] },
    ],
  }).expect(400);
  const latest = readResponse<TournamentView>(
    await admin.get(`${base}/tournaments/${t.id}`).expect(200),
    "TournamentView",
  );
  assert.equal(latest.entrants.length, 6);
});
test("only knockout starts without matches and participant additions are locked", async (): Promise<void> => {
  const t = await start(
    await create(admin, { ...initial, format: "KNOCKOUT" }),
  );
  assert.equal(t.currentStage, "KNOCKOUT");
  assert.equal(t.matches.length, 0);
  assert.equal(t.qualification, null);
  assert.equal(t.knockoutEligibility?.entrantIds.length, 4);
  await send(admin, "post", `/tournaments/${t.id}/entrants`, {
    expectedRevision: t.revision,
    entrants: [{ name: "Echo", aliases: [] }],
  }).expect(400);
});
test("owner import candidates are paginated and inaccessible to other owners", async (): Promise<void> => {
  const t = await create();
  const response = await admin
    .get(`${base}/tournaments/${t.id}/entrants?page=2&limit=2`)
    .expect(200);
  const page = response.body as { items: Entrant[]; total: number };
  assert.equal(page.items.length, 2);
  assert.equal(page.total, 4);
  await other.get(`${base}/tournaments/${t.id}/entrants`).expect(403);
});

async function pairCup(
  t: TournamentView,
  extra: object = {},
): Promise<TournamentView> {
  const ids = required(t.knockoutEligibility).entrantIds;
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
  return readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/rounds`, {
      expectedRevision: t.revision,
      pairs,
      byes: [],
      ...extra,
    }).expect(201),
    "TournamentView",
  );
}
test("random draws are reviewed, reject tampering and stale revisions", async (): Promise<void> => {
  let t = await start(await create(admin, { ...initial, format: "KNOCKOUT" }));
  const draw = readResponse<
    import("../../src/tournaments/tournament-response.dto").DrawPreview
  >(
    await send(admin, "post", `/tournaments/${t.id}/rounds/draw-preview`, {
      expectedRevision: t.revision,
      byes: [],
    }).expect(201),
    "DrawPreview",
  );
  await send(admin, "post", `/tournaments/${t.id}/rounds`, {
    expectedRevision: t.revision,
    method: "RANDOM",
    pairs: [draw.pairs[1], draw.pairs[0]],
    byes: [],
    drawToken: draw.drawToken,
  }).expect(400);
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/rounds`, {
      expectedRevision: t.revision,
      method: "RANDOM",
      pairs: draw.pairs,
      byes: [],
      drawToken: draw.drawToken,
    }).expect(201),
    "TournamentView",
  );
  assert.equal(t.rounds[0].method, "RANDOM");
});
test("fixed bracket advances only after all ties resolve and preserves slot ordering", async (): Promise<void> => {
  let t = await pairCup(
    await start(await create(admin, { ...initial, format: "KNOCKOUT" })),
    { method: "FIXED" },
  );
  const first = required(
      t.matches.find(
        (m: Match): boolean => m.knockoutTieId === t.knockoutTies[0].id,
      ),
    ),
    second = required(
      t.matches.find(
        (m: Match): boolean => m.knockoutTieId === t.knockoutTies[1].id,
      ),
    );
  t = readResponse<TournamentView>(
    await score(t, first, 2, 0).expect(200),
    "TournamentView",
  );
  assert.equal(t.rounds.length, 1);
  t = readResponse<TournamentView>(
    await score(t, second, 1, 0).expect(200),
    "TournamentView",
  );
  assert.equal(t.rounds.length, 2);
  assert.equal(t.knockoutTies.length, 3);
  const final = required(t.matches.find((m: Match): boolean => m.round === 2));
  assert.deepEqual([final.homeId, final.awayId], [first.homeId, second.homeId]);
  await send(admin, "post", `/tournaments/${t.id}/rounds`, {
    expectedRevision: t.revision,
    pairs: [],
    byes: [],
  }).expect(400);
  const old = required(
    t.matches.find((m: Match): boolean => m.id === first.id),
  );
  const correction = {
    homeScore: 0,
    awayScore: 2,
    expectedRevision: old.revision,
    expectedTournamentRevision: t.revision,
  };
  const impact = readResponse<CorrectionImpact>(
    await send(
      admin,
      "post",
      `/matches/${old.id}/correction-preview`,
      correction,
    ).expect(201),
    "CorrectionImpact",
  );
  assert.equal(impact.requiresReset, true);
  t = readResponse<TournamentView>(
    await send(admin, "patch", `/matches/${old.id}/result`, {
      ...correction,
      confirmReset: true,
      impactToken: impact.impactToken,
    }).expect(200),
    "TournamentView",
  );
  assert.equal(t.rounds.length, 2);
  assert.equal(
    required(t.matches.find((m: Match): boolean => m.round === 2)).homeId,
    first.awayId,
  );
});
test("two-leg final aggregates identities, allows first-leg draws, and resolves a tied aggregate", async (): Promise<void> => {
  let t = await pairCup(
    await start(
      await create(admin, {
        ...initial,
        format: "KNOCKOUT",
        knockoutLegs: 2,
        knockoutFinalLegs: 2,
        entrants: initial.entrants.slice(0, 2),
      }),
    ),
  );
  assert.equal(t.matches.length, 2);
  const leg1 = required(t.matches.find((m: Match): boolean => m.leg === 1));
  const leg2 = required(t.matches.find((m: Match): boolean => m.leg === 2));
  t = readResponse<TournamentView>(
    await score(t, leg1, 2, 0).expect(200),
    "TournamentView",
  );
  assert.equal(t.status, "ACTIVE");
  t = readResponse<TournamentView>(
    await score(t, leg2, 2, 0, {
      knockoutDecision: { winnerId: leg1.homeId },
    }).expect(200),
    "TournamentView",
  );
  assert.equal(t.status, "COMPLETED");
  assert.equal(t.championId, leg1.homeId);
  assert.equal(t.knockoutTies[0].homeAggregate, 2);
  assert.equal(t.knockoutTies[0].awayAggregate, 2);
  const current = required(
    t.matches.find((m: Match): boolean => m.id === leg1.id),
  );
  t = readResponse<TournamentView>(
    await score(t, current, null, null).expect(200),
    "TournamentView",
  );
  assert.equal(t.status, "ACTIVE");
  assert.equal(t.championId, null);
  assert.equal(t.knockoutTies[0].winnerId, null);
});
test("completed league reopens after additions and retains all scored fixtures", async (): Promise<void> => {
  let t = await start(
    await create(admin, { ...initial, entrants: initial.entrants.slice(0, 2) }),
  );
  t = readResponse<TournamentView>(
    await score(t, t.matches[0], 2, 0).expect(200),
    "TournamentView",
  );
  assert.equal(t.status, "COMPLETED");
  const old = t.matches[0];
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/entrants`, {
      expectedRevision: t.revision,
      entrants: [{ name: "New", aliases: [] }],
    }).expect(201),
    "TournamentView",
  );
  assert.equal(t.status, "ACTIVE");
  assert.equal(t.championId, null);
  assert.deepEqual(
    t.matches.find((m: Match): boolean => m.id === old.id),
    old,
  );
});
test("simultaneous additions serialize and stale requests do not insert teams", async (): Promise<void> => {
  const t = await start(await create());
  const results = await Promise.all(
    ["New 1", "New 2"].map((name: string): Promise<RequestResponse> =>
      send(admin, "post", `/tournaments/${t.id}/entrants`, {
        expectedRevision: t.revision,
        entrants: [{ name, aliases: [] }],
      }),
    ),
  );
  assert.deepEqual(
    results.map((r: RequestResponse): number => r.status).sort(),
    [201, 409],
  );
});

test("group additions stay in their assigned scope and stop at qualification confirmation", async (): Promise<void> => {
  let t = await start(
    await create(admin, {
      ...initial,
      format: "WORLD_CUP",
      groups: [
        { name: "A", qualifierCount: 1 },
        { name: "B", qualifierCount: 1 },
      ],
      entrants: initial.entrants.map(
        (e: (typeof initial.entrants)[number], i: number): object => ({
          ...e,
          groupIndex: i < 2 ? 0 : 1,
        }),
      ),
    }),
  );
  const old = structuredClone(t.matches),
    group = t.groups[0];
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/entrants`, {
      expectedRevision: t.revision,
      entrants: [
        { name: "Echo", aliases: [], groupId: group.id },
        { name: "Foxtrot", aliases: [], groupId: group.id },
      ],
    }).expect(201),
    "TournamentView",
  );
  assert.equal(t.matches.length, 7);
  assert.deepEqual(
    t.matches.filter((m: Match): boolean =>
      old.some((x: Match): boolean => x.id === m.id),
    ),
    old,
  );
  for (const original of t.matches) {
    const m = required(
      t.matches.find((x: Match): boolean => x.id === original.id),
    );
    const h = t.entrants.findIndex((e: Entrant): boolean => e.id === m.homeId),
      a = t.entrants.findIndex((e: Entrant): boolean => e.id === m.awayId);
    t = readResponse<TournamentView>(
      await score(t, m, h < a ? 2 : 0, h < a ? 0 : 2).expect(200),
      "TournamentView",
    );
  }
  assert.ok(t.qualificationPreview);
  t = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/qualification`, {
      expectedRevision: t.revision,
    }).expect(201),
    "TournamentView",
  );
  await send(admin, "post", `/tournaments/${t.id}/entrants`, {
    expectedRevision: t.revision,
    entrants: [{ name: "Late", aliases: [], groupId: group.id }],
  }).expect(400);
});
test("qualification and participant additions serialize without partial stage changes", async (): Promise<void> => {
  let t = await start(
    await create(admin, {
      ...initial,
      format: "WORLD_CUP",
      groups: [
        { name: "A", qualifierCount: 1 },
        { name: "B", qualifierCount: 1 },
      ],
      entrants: initial.entrants.map(
        (e: (typeof initial.entrants)[number], i: number): object => ({
          ...e,
          groupIndex: i < 2 ? 0 : 1,
        }),
      ),
    }),
  );
  for (const m of t.matches)
    t = readResponse<TournamentView>(
      await score(t, m, 2, 0).expect(200),
      "TournamentView",
    );
  const results = await Promise.all([
    send(admin, "post", `/tournaments/${t.id}/qualification`, {
      expectedRevision: t.revision,
    }),
    send(admin, "post", `/tournaments/${t.id}/entrants`, {
      expectedRevision: t.revision,
      entrants: [{ name: "Late team", aliases: [], groupId: t.groups[0].id }],
    }),
  ]);
  assert.deepEqual(
    results.map((r: RequestResponse): number => r.status).sort(),
    [201, 409],
  );
  const latest = readResponse<TournamentView>(
    await admin.get(`${base}/tournaments/${t.id}`).expect(200),
    "TournamentView",
  );
  assert.ok(
    latest.qualification
      ? latest.entrants.length === 4
      : latest.entrants.length === 5,
  );
});

test("scorecard extraction is restricted to eFootball tournaments", async (): Promise<void> => {
  const t = await start(await create(admin, { ...initial, game: "CODM" }));
  const m = t.matches[0];
  const image = await sharp({
    create: { width: 50, height: 50, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await other
    .post(`${base}/matches/${m.id}/extract-score`)
    .set("X-CSRF-Token", otherCsrf)
    .attach("image", image, "score.png")
    .expect(403);
  const result = await admin
    .post(`${base}/matches/${m.id}/extract-score`)
    .set("X-CSRF-Token", csrf)
    .attach("image", image, "score.png")
    .expect(400);
  const error = readResponse<ApiError>(result, "ApiError");
  assert.equal(error.code, "RULE_VIOLATION");
  assert.equal(
    error.message,
    "Scorecard upload is only available for eFootball tournaments.",
  );
  assert.equal(
    required(await db.match.findUnique({ where: { id: m.id } })).homeScore,
    null,
  );
  const saved = readResponse<TournamentView>(
    await score(t, m, 9, 4).expect(200),
    "TournamentView",
  );
  assert.equal(
    saved.matches.find((match: Match): boolean => match.id === m.id)?.homeScore,
    9,
  );
});

test("stats quota is serialized, archiving preserves results and releases a slot", async (): Promise<void> => {
  let t = await start(await create(admin, { ...initial, statsEnabled: true }));
  const match = required(t.matches[0]);
  t = readResponse<TournamentView>(
    await score(t, match, 2, 1, {
      stats: [
        { key: "shots", label: "Shots", unit: "count", home: 0, away: 7 },
      ],
    }).expect(200),
    "TournamentView",
  );
  const publicStats = readResponse<
    import("../../src/stats/team-stats.dto").TeamStatsView
  >(
    await guest
      .get(`${base}/public/tournaments/${t.publicId}/stats`)
      .expect(200),
    "TeamStatsView",
  );
  assert.equal(
    publicStats.teams
      .find(
        (
          team: import("../../src/stats/team-stats.dto").TeamStatsRow,
        ): boolean => team.entrantId === match.homeId,
      )
      ?.stats.find(
        (
          stat: import("../../src/stats/team-stats.dto").TeamStatValueView,
        ): boolean => stat.key === "shots",
      )?.value,
    0,
  );
  await create(admin, { ...initial, statsEnabled: true });
  const concurrent = await Promise.all([
    send(admin, "post", "/tournaments", { ...initial, statsEnabled: true }),
    send(admin, "post", "/tournaments", { ...initial, statsEnabled: true }),
  ]);
  assert.deepEqual(
    concurrent
      .map((response: RequestResponse): number => response.status)
      .sort(),
    [201, 409],
  );
  const preview = await send(
    admin,
    "post",
    `/tournaments/${t.id}/stats/archive-preview`,
    {},
  ).expect(200);
  const impact = readResponse<
    import("../../src/stats/team-stats.dto").ArchiveStatsPreviewView
  >(preview, "ArchiveStatsPreviewView");
  const archived = readResponse<TournamentView>(
    await send(admin, "post", `/tournaments/${t.id}/stats/archive`, {
      expectedRevision: impact.tournamentRevision,
      statsMatchCount: impact.statsMatchCount,
    }).expect(200),
    "TournamentView",
  );
  assert.equal(archived.statsEnabled, false);
  assert.equal(
    archived.matches.find((entry: Match): boolean => entry.id === match.id)
      ?.homeScore,
    2,
  );
  assert.ok(
    archived.matches.every((entry: Match): boolean => entry.stats === null),
  );
  await create(admin, { ...initial, statsEnabled: true });
});
