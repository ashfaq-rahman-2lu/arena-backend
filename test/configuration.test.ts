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

const brevoEnvironment: Record<string, unknown> = {
  ...valid,
  SMTP_HOST: "smtp-relay.brevo.com",
  SMTP_PORT: "2525",
  SMTP_SECURE: "false",
  SMTP_USER: "test-smtp-login",
  SMTP_PASSWORD: "test-smtp-key",
  MAIL_FROM: "Arena <noreply@example.test>",
};

test("Brevo configuration maps SMTP credentials and port 2525 without implicit TLS", (): void => {
  assert.deepEqual(validateConfiguration(brevoEnvironment).smtp, {
    host: "smtp-relay.brevo.com",
    port: 2525,
    secure: false,
    user: "test-smtp-login",
    password: "test-smtp-key",
    from: "Arena <noreply@example.test>",
  });
});

for (const patch of [
  { SMTP_USER: "", SMTP_PASSWORD: "" },
  { SMTP_USER: " ", SMTP_PASSWORD: " " },
  { MAIL_FROM: undefined },
]) {
  test(`Brevo startup rejects missing account settings: ${Object.keys(patch).join(",")}`, (): void => {
    assert.throws(
      (): unknown => validateConfiguration({ ...brevoEnvironment, ...patch }),
      /Brevo requires SMTP_USER, SMTP_PASSWORD, and an explicit MAIL_FROM/,
    );
  });
}

test("local Mailpit remains available without SMTP authentication", (): void => {
  const config = validateConfiguration({
    ...valid,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
  });
  assert.equal(config.smtp?.user, null);
  assert.equal(config.smtp?.password, null);
  assert.equal(config.smtp?.from, "Arena <noreply@arena.local>");
});
