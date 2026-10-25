import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";

test("OAuthAttempt return destination default matches the committed migration", (): void => {
  const model = Prisma.dmmf.datamodel.models.find(
    (entry: Prisma.DMMF.Model): boolean => entry.name === "OAuthAttempt",
  );
  const field = model?.fields.find(
    (entry: Prisma.DMMF.Field): boolean => entry.name === "returnTo",
  );
  assert.equal(field?.default, "/dashboard");
});
