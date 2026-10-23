import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { offlineEnvironment } from "../src/config/configuration";

const entrySchema = z.object({
  level: z.string(),
  timestamp: z.number().positive(),
  context: z.string(),
  message: z.object({
    event: z.literal("logging_check"),
    inferenceMs: z.literal(3200),
    note: z.literal('two\nlines with "quotes"'),
  }),
});
type LogEntry = z.infer<typeof entrySchema>;
interface CapturedLogOutput {
  stdout: string;
  stderr: string;
}

function captureLogs(environment: string): CapturedLogOutput {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
      const { Test } = require('@nestjs/testing');
      const { Logger } = require('@nestjs/common');
      const { InfrastructureModule } = require('./dist/src/infrastructure.module');
      (async () => {
        const module = await Test.createTestingModule({
          imports: [InfrastructureModule.register(JSON.parse(process.argv[1]))]
        }).compile();
        const logger = module.get(Logger);
        const event = {event:'logging_check', inferenceMs:3200, note:'two\\nlines with "quotes"'};
        logger.log(event);
        logger.warn(event);
        logger.error(event);
        logger.debug(event);
        await module.close();
      })().catch(() => { process.exitCode = 1; });
      `,
      JSON.stringify({
        ...offlineEnvironment,
        NODE_ENV: environment,
        COOKIE_SECURE: "true",
        FRONTEND_URL: "https://arena.example",
      }),
    ],
    { cwd: resolve(__dirname, "../.."), encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return { stdout: result.stdout, stderr: result.stderr };
}

test("production logger emits single-line JSON with numeric searchable event fields", (): void => {
  const output = captureLogs("production");
  const lines = [...output.stdout.trim().split("\n"), output.stderr.trim()];
  assert.equal(lines.length, 3);
  const entries = lines.map((line: string): LogEntry =>
    entrySchema.parse(JSON.parse(line)),
  );
  assert.deepEqual(
    entries.map((entry: LogEntry): string => entry.level),
    ["log", "warn", "error"],
  );
  assert.ok(
    entries.every((entry: LogEntry): boolean => entry.context === "Arena"),
  );
});

test("test logger stays silent", (): void => {
  assert.deepEqual(captureLogs("test"), { stdout: "", stderr: "" });
});

test("development logger remains readable", (): void => {
  const output = captureLogs("development");
  assert.match(output.stdout, /logging_check/);
  assert.match(output.stderr, /logging_check/);
  assert.match(output.stdout, /\[Arena\]/);
});
