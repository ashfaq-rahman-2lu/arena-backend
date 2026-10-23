import assert from "node:assert/strict";
import { test } from "node:test";
import { validateConfiguration } from "../src/config/configuration";
const valid: Record<string, unknown> = {
  DATABASE_URL: "postgresql://arena:arena@localhost/arena_test",
  FRONTEND_URL: "http://localhost:5173",
  SESSION_SECRET: "test-secret-with-at-least-thirty-two-characters",
  NODE_ENV: "test",
};
for (const patch of [
  { SESSION_SECRET: "short" },
  { PORT: "0" },
  { DATABASE_URL: "https://invalid.test" },
  { AUTH_RATE_LIMIT: "-1" },
  { EXTRACTION_RATE_LIMIT: "Infinity" },
  { PADDLEOCR_PYTHON: "" },
  { PADDLEOCR_TIMEOUT_MS: "0" },
  { PADDLEOCR_TIMEOUT_MS: "300001" },
  { GOOGLE_CLIENT_ID: "partial" },
  { SMTP_USER: "partial" },
  { NODE_ENV: "production", COOKIE_SECURE: "false" },
]) {
  test(`startup rejects invalid configuration ${Object.keys(patch).join(",")}`, (): void => {
    assert.throws((): unknown => validateConfiguration({ ...valid, ...patch }));
  });
}
test("optional integrations are represented as disabled", (): void => {
  const config = validateConfiguration(valid);
  assert.equal(config.smtp, null);
  assert.equal(config.google, null);
  assert.deepEqual(config.vision, { python: "python3", timeoutMs: 75000 });
});

test("OCR timeout accepts a deployment override", (): void => {
  assert.equal(
    Reflect.get(
      validateConfiguration({ ...valid, PADDLEOCR_TIMEOUT_MS: "45000" }).vision,
      "timeoutMs",
    ),
    45000,
  );
});
