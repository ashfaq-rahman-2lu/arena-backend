interface RuleMessage {
  ruleId: string | null;
}
import { test } from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
const eslint = new ESLint();
test("enforcement rejects unsafe signatures and casts", async (): Promise<void> => {
  const [result] = await eslint.lintText(
    "export const invalid = (value: any) => value!.missing as unknown as string;",
    { filePath: "src/lint-fixture.ts" },
  );
  for (const rule of [
    "@typescript-eslint/no-explicit-any",
    "@typescript-eslint/no-non-null-assertion",
    "@typescript-eslint/explicit-function-return-type",
    "arena/no-double-cast",
  ])
    assert(
      result.messages.some(
        (message: RuleMessage): boolean => message.ruleId === rule,
      ),
      `missing enforcement: ${rule}`,
    );
});
test("callbacks require explicit parameter annotations", async (): Promise<void> => {
  const [result] = await eslint.lintText("[1].map(value => value);", {
    filePath: "src/lint-fixture.ts",
  });
  assert(
    result.messages.some(
      (message: RuleMessage): boolean =>
        message.ruleId === "arena/explicit-parameters",
    ),
  );
});
test("Nest artifacts require both a suffix and matching filename", async (): Promise<void> => {
  for (const code of [
    'import {Injectable} from "@nestjs/common"; @Injectable() export class Bad {}',
    'import {Injectable} from "@nestjs/common"; @Injectable() export class ValidService {}',
  ]) {
    const [result] = await eslint.lintText(code, {
      filePath: "src/lint-fixture.ts",
    });
    assert(
      result.messages.some(
        (message: RuleMessage): boolean =>
          message.ruleId === "arena/artifact-name",
      ),
    );
  }
});
