import assert from "node:assert/strict";
import { test } from "node:test";
import { mapApiError } from "../src/common/api-exception.filter";
import { ApplicationError } from "../src/common/application-error";
test("unexpected failures do not disclose SQL, credentials or provider details", (): void => {
  const result = mapApiError(new Error("password=secret SELECT * FROM User"));
  assert.deepEqual(result, {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please retry.",
  });
});
test("typed verification failures preserve their named reason", (): void => {
  assert.equal(
    mapApiError(
      new ApplicationError(
        "EMAIL_VERIFICATION_REQUIRED",
        403,
        "Verify your email before signing in",
      ),
    ).code,
    "EMAIL_VERIFICATION_REQUIRED",
  );
});
