import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app";
import { offlineEnvironment } from "../src/config/configuration";
import { documentation } from "../src/swagger";

test("Swagger references defined security schemes and requires cookie plus CSRF for protected mutations", async (): Promise<void> => {
  const app = await createApp({ environment: offlineEnvironment });
  try {
    const document = documentation(app);
    const schemes = document.components?.securitySchemes ?? {};
    for (const [path, item] of Object.entries(document.paths)) {
      for (const method of ["get", "post", "patch", "put", "delete"] as const) {
        const operation = item[method];
        if (!operation) continue;
        for (const requirement of operation.security ?? [])
          for (const name of Object.keys(requirement))
            assert.ok(
              Object.hasOwn(schemes, name),
              `${path}: undefined ${name}`,
            );
        const following = path.startsWith("/api/v1/following");
        const profile = [
          "profile",
          "password/setup",
          "password/change",
          "email-change",
        ].some((suffix: string): boolean => path === `/api/v1/auth/${suffix}`);
        if (following || profile)
          assert.deepEqual(
            operation.security,
            [method === "get" ? { cookie: [] } : { cookie: [], csrf: [] }],
            `${method} ${path}`,
          );
      }
    }
  } finally {
    await app.close();
  }
});

test("Swagger declares CSRF authorization for every auth mutation", async (): Promise<void> => {
  const app = await createApp({ environment: offlineEnvironment });
  try {
    const document = documentation(app);
    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!path.startsWith("/api/v1/auth/")) continue;
      for (const method of ["post", "patch"] as const) {
        const operation = pathItem[method];
        if (!operation) continue;
        assert.ok(
          operation.security?.some(
            (requirement: Record<string, string[]>): boolean =>
              Object.hasOwn(requirement, "csrf"),
          ),
          `${method.toUpperCase()} ${path} must document CSRF authorization`,
        );
      }
    }
    for (const path of [
      "/api/v1/auth/profile",
      "/api/v1/auth/password/setup",
      "/api/v1/auth/password/change",
      "/api/v1/auth/email-change",
    ]) {
      const operation =
        document.paths[path]?.post ?? document.paths[path]?.patch;
      assert.ok(operation, `${path} must be documented`);
      assert.ok(
        operation.security?.some(
          (requirement: Record<string, string[]>): boolean =>
            Object.hasOwn(requirement, "cookie") &&
            Object.hasOwn(requirement, "csrf"),
        ),
        `${path} must require both session cookie and CSRF token`,
      );
    }
  } finally {
    await app.close();
  }
});
