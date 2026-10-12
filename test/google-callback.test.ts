import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import assert from "node:assert/strict";
import { test } from "node:test";
import { GoogleCallbackQuery } from "../src/auth/auth-request.dto";

async function validateQuery(
  query: Record<string, unknown>,
): Promise<GoogleCallbackQuery> {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const result: unknown = await pipe.transform(query, {
    type: "query",
    metatype: GoogleCallbackQuery,
  });
  assert.ok(result instanceof GoogleCallbackQuery);
  return result;
}

test("Google callback accepts provider metadata alongside validated state and code", async (): Promise<void> => {
  const query = await validateQuery({
    state: "a".repeat(64),
    code: "authorization-code",
    scope: "openid email profile",
    authuser: "0",
    prompt: "consent",
    hd: "example.com",
    iss: "https://accounts.google.com",
  });
  assert.equal(query.state, "a".repeat(64));
  assert.equal(query.code, "authorization-code");
});

test("Google callback still requires valid state and code", async (): Promise<void> => {
  for (const patch of [{ state: "short" }, { code: "" }, { code: undefined }]) {
    await assert.rejects(
      validateQuery({ state: "a".repeat(64), code: "code", ...patch }),
      /Bad Request/,
    );
  }
});

test("Google callback rejects unexpected fields and repeated metadata values", async (): Promise<void> => {
  for (const patch of [
    { unexpected: "value" },
    { scope: ["openid", "email"] },
  ]) {
    await assert.rejects(
      validateQuery({ state: "a".repeat(64), code: "code", ...patch }),
      /Bad Request/,
    );
  }
});
