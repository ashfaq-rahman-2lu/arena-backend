import { INestApplication } from "@nestjs/common";
import assert from "node:assert/strict";
import { request as httpRequest, Server } from "node:http";
import { AddressInfo } from "node:net";
import { setImmediate as nextTurn } from "node:timers/promises";
import { test } from "node:test";
import {
  NextFunction,
  Request,
  Response as ExpressResponse,
  Router,
} from "express";
import request, { Response as TestResponse } from "supertest";
import { z } from "zod";
import { ApplicationOptions, createApp } from "../src/app";
import { offlineEnvironment } from "../src/config/configuration";

const summarySchema = z.object({
  event: z.literal("http_request"),
  timestamp: z.iso.datetime(),
  requestId: z.string().regex(/^[\w-]{1,100}$/),
  method: z.string(),
  route: z.string(),
  statusCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative(),
  outcome: z.enum(["completed", "aborted"]),
  userId: z.string().nullable(),
  clientIp: z.string().nullable(),
  userAgent: z.string().max(512).nullable(),
  errorCode: z.string().nullable(),
  errorType: z.string().nullable(),
});
type Summary = z.infer<typeof summarySchema>;
interface CapturedEvent {
  level: "log" | "warn" | "error";
  message: unknown;
}
interface LoggingFixture {
  app: INestApplication;
  server: Server;
  events: CapturedEvent[];
}
async function fixture(
  rateLimit: string = "20",
  hanging: () => void = (): void => {},
): Promise<LoggingFixture> {
  const events: CapturedEvent[] = [];
  const options: ApplicationOptions = {
    environment: { ...offlineEnvironment, AUTH_RATE_LIMIT: rateLimit },
    logger: {
      log: (message: unknown): void => {
        events.push({ level: "log", message });
      },
      warn: (message: unknown): void => {
        events.push({ level: "warn", message });
      },
      error: (message: unknown): void => {
        events.push({ level: "error", message });
      },
    },
  };
  const app = await createApp(options);
  const router = Router();
  router.get(
    "/api/v1/probe/:id",
    (_req: Request, res: ExpressResponse): void => {
      res.json({ password: "private-response-password" });
    },
  );
  router.get(
    "/api/v1/redirect",
    (_req: Request, res: ExpressResponse): void => {
      res.redirect("https://example.test/?token=private-redirect-token");
    },
  );
  router.get(
    "/api/v1/failure",
    (_req: Request, _res: ExpressResponse, next: NextFunction): void => {
      next(new Error("password=private-database-password SELECT * FROM User"));
    },
  );
  router.get(
    "/api/v1/hanging",
    (_req: Request, _res: ExpressResponse): void => {
      hanging();
    },
  );
  app.use(router);
  await app.init();
  const server: unknown = app.getHttpServer();
  assert.ok(server instanceof Server);
  return { app, server: server as Server, events };
}

function summaries(events: CapturedEvent[]): Summary[] {
  return events.flatMap((entry: CapturedEvent): Summary[] => {
    const parsed = summarySchema.safeParse(entry.message);
    return parsed.success ? [parsed.data] : [];
  });
}

function csrf(response: TestResponse): string {
  const body: unknown = response.body;
  return z.object({ csrf: z.string() }).parse(body).csrf;
}

test("every response gets one safe request summary and the same request ID", async (): Promise<void> => {
  const f = await fixture();
  try {
    const response = await request(f.server)
      .get("/api/v1/probe/private-resource?token=private-query-token")
      .set("X-Request-ID", "forwarded-123")
      .set("User-Agent", "test-browser".repeat(100))
      .set("Authorization", "Bearer private-bearer-token")
      .set("Cookie", "private-cookie=value")
      .expect(200);
    await nextTurn();
    assert.equal(response.headers["x-request-id"], "forwarded-123");
    const entries = summaries(f.events);
    assert.equal(entries.length, 1, "missing the completed request summary");
    assert.deepEqual(
      { ...entries[0], timestamp: "time", durationMs: 0, clientIp: "ip" },
      {
        event: "http_request",
        timestamp: "time",
        requestId: "forwarded-123",
        method: "GET",
        route: "/api/v1/probe/:id",
        statusCode: 200,
        durationMs: 0,
        outcome: "completed",
        userId: null,
        clientIp: "ip",
        userAgent: "test-browser".repeat(100).slice(0, 512),
        errorCode: null,
        errorType: null,
      },
    );
    assert.ok(entries[0]?.clientIp);
    assert.equal(f.events[0]?.level, "log");
    assert.doesNotMatch(JSON.stringify(f.events), /private-|Bearer|SELECT/);
  } finally {
    await f.app.close();
  }
});

test("IDs are generated for missing, invalid, oversized, and duplicate headers", async (): Promise<void> => {
  const f = await fixture();
  try {
    for (const header of [
      undefined,
      "invalid id",
      "a".repeat(101),
      ["first", "second"],
    ]) {
      const pending = request(f.server).get("/api/v1/auth/session");
      if (header !== undefined) pending.set({ "X-Request-ID": header });
      const response = await pending.expect(200);
      assert.match(String(response.headers["x-request-id"]), /^[a-f0-9-]{36}$/);
    }
    await nextTurn();
    assert.equal(summaries(f.events).length, 4);
  } finally {
    await f.app.close();
  }
});

test("preflights, documentation, redirects and unmatched paths are logged", async (): Promise<void> => {
  const f = await fixture();
  try {
    const preflight = await request(f.server)
      .options("/api/v1/auth/session")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    assert.ok(preflight.headers["x-request-id"]);
    const session = await request(f.server)
      .get("/api/v1/auth/session")
      .set("Origin", "http://localhost:5173")
      .expect(200);
    assert.match(
      String(session.headers["access-control-expose-headers"]),
      /X-Request-ID/i,
    );
    await request(f.server).get("/api/docs/").expect(200);
    await request(f.server).get("/api/openapi.json").expect(200);
    await request(f.server).get("/api/v1/redirect").expect(302);
    await request(f.server)
      .get("/private-unmatched-token?code=private-oauth-code")
      .expect(404);
    await nextTurn();
    assert.deepEqual(
      summaries(f.events).map(
        (entry: Summary): number | null => entry.statusCode,
      ),
      [204, 200, 200, 200, 302, 404],
    );
    assert.equal(summaries(f.events).at(-1)?.route, "unmatched");
    assert.doesNotMatch(JSON.stringify(f.events), /private-/);
  } finally {
    await f.app.close();
  }
});

test("early parser errors and guard failures receive safe error summaries", async (): Promise<void> => {
  const f = await fixture();
  try {
    await request(f.server)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{"password":"private-body",')
      .expect(400);
    await request(f.server)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send({ password: "x".repeat(110000) })
      .expect(413);
    await request(f.server).get("/api/v1/tournaments").expect(401);
    await request(f.server)
      .post("/api/v1/auth/login")
      .send({ password: "private-password" })
      .expect(403);
    await request(f.server).get("/api/v1/failure").expect(500);
    await nextTurn();
    assert.deepEqual(
      summaries(f.events).map(
        (entry: Summary): number | null => entry.statusCode,
      ),
      [400, 413, 401, 403, 500],
    );
    assert.deepEqual(
      f.events
        .filter(
          (entry: CapturedEvent): boolean =>
            summarySchema.safeParse(entry.message).success,
        )
        .map((entry: CapturedEvent): string => entry.level),
      ["warn", "warn", "warn", "warn", "error"],
    );
    assert.equal(summaries(f.events).at(-1)?.errorCode, "INTERNAL_ERROR");
    assert.equal(summaries(f.events).at(-1)?.errorType, "Error");
    assert.doesNotMatch(JSON.stringify(f.events), /private-|SELECT|password/);
  } finally {
    await f.app.close();
  }
});

test("validated input errors and rate limits are logged without their payload", async (): Promise<void> => {
  const f = await fixture("1");
  try {
    const agent = request.agent(f.server);
    const token = csrf(await agent.get("/api/v1/auth/session").expect(200));
    for (const status of [400, 429]) {
      await agent
        .post("/api/v1/auth/login")
        .set("X-CSRF-Token", token)
        .send({ email: "private-email@example.test", password: "short" })
        .expect(status);
    }
    await nextTurn();
    assert.deepEqual(
      summaries(f.events).map(
        (entry: Summary): number | null => entry.statusCode,
      ),
      [200, 400, 429],
    );
    assert.equal(summaries(f.events).at(-1)?.errorCode, "RATE_LIMITED");
    assert.doesNotMatch(JSON.stringify(f.events), /private-email|short|"csrf"/);
  } finally {
    await f.app.close();
  }
});

test("disconnects emit one aborted summary without claiming a successful status", async (): Promise<void> => {
  let reached: () => void = (): void => {};
  const arrived = new Promise<void>((resolve: () => void): void => {
    reached = resolve;
  });
  const f = await fixture("20", (): void => reached());
  try {
    await f.app.listen(0, "127.0.0.1");
    const address = f.server.address();
    assert.ok(address && typeof address !== "string");
    const target: AddressInfo = address;
    const pending = httpRequest({
      host: "127.0.0.1",
      port: target.port,
      path: "/api/v1/hanging",
      headers: { "X-Request-ID": "aborted-123" },
    });
    pending.on("error", (): void => {});
    pending.end();
    await arrived;
    pending.destroy();
    for (
      let attempt = 0;
      attempt < 20 && summaries(f.events).length === 0;
      attempt++
    )
      await new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, 5);
      });
    const entries = summaries(f.events);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.outcome, "aborted");
    assert.equal(entries[0]?.statusCode, null);
    assert.equal(entries[0]?.requestId, "aborted-123");
    assert.equal(f.events[0]?.level, "warn");
  } finally {
    await f.app.close();
  }
});
