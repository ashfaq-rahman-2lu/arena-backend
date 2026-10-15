import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app";
import { offlineEnvironment } from "../src/config/configuration";
import { documentation } from "../src/swagger";

test("Swagger declares CSRF authorization for every auth mutation", async (): Promise<void> => {
  const app = await createApp({ environment: offlineEnvironment });
  try {
    const document = documentation(app);
    for (const action of [
      "register",
      "login",
      "verify",
      "resend-verification",
      "forgot-password",
      "reset-password",
      "logout",
    ]) {
      const operation = document.paths[`/api/v1/auth/${action}`]?.post;
      assert.ok(operation, `POST /auth/${action} must be documented`);
      assert.ok(
        operation.security?.some(
          (requirement: Record<string, string[]>): boolean =>
            Object.hasOwn(requirement, "csrf"),
        ),
        `POST /auth/${action} must send the authorized CSRF token`,
      );
    }
  } finally {
    await app.close();
  }
});
