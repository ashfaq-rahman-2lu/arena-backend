import { INestApplication } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import express, { Request, Response, Router } from "express";
import { z } from "zod";
import { EmailMessage, GoogleIdentity } from "../src/auth/auth.models";
import { OAuthPort } from "../src/auth/google-oauth.adapter";
import { EmailPort } from "../src/auth/smtp-email.adapter";
import { ApplicationError } from "../src/common/application-error";
import { DatabaseService } from "../src/database/database.service";
import { TournamentsService } from "../src/tournaments/tournaments.service";

const origin = "http://127.0.0.1:3001";
const accountInput = z.object({
  kind: z.enum(["password", "google"]).default("password"),
  follows: z.number().int().min(0).max(21).default(0),
});
const authorizationInput = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
  email: z.email(),
  outcome: z.enum(["success", "cancel", "failure"]),
});

/** Only installed by the loopback browser-test entry point, never AppModule. */
export class BrowserAccountFixture implements EmailPort, OAuthPort {
  private readonly messages: EmailMessage[] = [];
  private readonly codes: Map<string, GoogleIdentity | null> = new Map();
  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
  authorize(state: string): string {
    return `${origin}/__test/oauth?state=${encodeURIComponent(state)}`;
  }
  async identity(code: string): Promise<GoogleIdentity> {
    const identity = this.codes.get(code);
    this.codes.delete(code);
    if (!identity)
      throw new ApplicationError(
        "INTEGRATION_UNAVAILABLE",
        503,
        "Fake Google unavailable",
      );
    return identity;
  }
  install(app: INestApplication): void {
    const db = app.get(DatabaseService);
    const tournaments = app.get(TournamentsService);
    const router: Router = express.Router();
    router.use(express.json(), express.urlencoded({ extended: false }));
    router.post(
      "/accounts",
      async (request: Request, response: Response): Promise<void> => {
        const parsed = accountInput.safeParse(request.body);
        if (!parsed.success) {
          response.status(400).json({ error: "Invalid test account" });
          return;
        }
        const email = `${randomUUID()}@browser.test`;
        const password = "IsolatedBrowser2026!";
        const user = await db.user.create({
          data: {
            email,
            name: "Isolated browser user",
            verified: true,
            passwordHash:
              parsed.data.kind === "password"
                ? await argon2.hash(password, { type: argon2.argon2id })
                : null,
            ...(parsed.data.kind === "google"
              ? {
                  identities: {
                    create: { provider: "google", subject: `fake:${email}` },
                  },
                }
              : {}),
          },
        });
        const items: { id: string; publicId: string; name: string }[] = [];
        for (let index = 0; index < Math.max(parsed.data.follows, 1); index++) {
          const tournament = await tournaments.create(user.id, {
            name: `Isolated tournament ${index}`,
            game: "EFOOTBALL",
            format: "LEAGUE",
            knockoutLegs: 1,
            knockoutFinalLegs: 1,
            legs: 1,
            winPoints: 3,
            drawPoints: 1,
            lossPoints: 0,
            groups: [],
            entrants: [
              { name: "Alpha", aliases: [] },
              { name: "Beta", aliases: [] },
            ],
          });
          items.push({
            id: tournament.id,
            publicId: tournament.publicId,
            name: tournament.name,
          });
          if (parsed.data.follows)
            await db.tournamentFollow.create({
              data: { userId: user.id, tournamentId: tournament.id },
            });
        }
        response.json({ email, password, userId: user.id, tournaments: items });
      },
    );
    router.get("/mail", (request: Request, response: Response): void => {
      const email = z.email().safeParse(request.query.email);
      if (!email.success) {
        response.status(400).json({ error: "Invalid test email" });
        return;
      }
      response.json(
        this.messages.filter(
          (message: EmailMessage): boolean => message.to === email.data,
        ),
      );
    });
    router.get("/oauth", (request: Request, response: Response): void => {
      const state = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .safeParse(request.query.state);
      if (!state.success) {
        response.sendStatus(400);
        return;
      }
      response
        .setHeader(
          "Content-Security-Policy",
          "default-src 'none'; form-action 'self' http://127.0.0.1:5174",
        )
        .type("html")
        .send(
          `<html><head><title>Local fake Google</title></head><body><h1>Local fake Google</h1><form method="post" action="/__test/authorize"><input type="hidden" name="state" value="${state.data}"><label>Google email<input type="email" name="email" required></label><button name="outcome" value="success">Approve Google</button><button name="outcome" value="cancel">Cancel Google</button><button name="outcome" value="failure">Fail Google</button></form></body></html>`,
        );
    });
    router.post("/authorize", (request: Request, response: Response): void => {
      const parsed = authorizationInput.safeParse(request.body);
      if (!parsed.success) {
        response.sendStatus(400);
        return;
      }
      const { state, email, outcome } = parsed.data;
      const params = new URLSearchParams({ state });
      if (outcome === "cancel") params.set("error", "access_denied");
      else {
        const code = randomUUID();
        this.codes.set(
          code,
          outcome === "failure"
            ? null
            : { subject: `fake:${email}`, email, name: "Fake Google user" },
        );
        params.set("code", code);
      }
      response.redirect(`${origin}/api/v1/auth/google/callback?${params}`);
    });
    app.use("/__test", router);
  }
}
