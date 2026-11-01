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

function captureLogs(
  environment: string,
  correlated: boolean = false,
): CapturedLogOutput {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
      const { Test } = require('@nestjs/testing');
      const { Logger } = require('@nestjs/common');
      const { InfrastructureModule } = require('./dist/src/infrastructure.module');
      const { RequestContextService } = require('./dist/src/common/request-context.service');
      (async () => {
        const module = await Test.createTestingModule({
          imports: [InfrastructureModule.register(JSON.parse(process.argv[1]))]
        }).compile();
        const logger = module.get(Logger);
        const event = {event:'logging_check', inferenceMs:3200, note:'two\\nlines with "quotes"'};
        if (process.argv[2] === 'true') {
          const context = module.get(RequestContextService);
          await Promise.all(['a', 'b'].map(id => context.run({requestId:'context-'+id,userId:'user-'+id,errorCode:null,errorType:null}, async () => {
            await new Promise(resolve => setTimeout(resolve, id === 'a' ? 20 : 1));
            logger.log({...event, requestId:'forged', userId:'forged'});
            logger.warn(event);
            logger.error(event);
          })));
          logger.log(event);
          await module.close();
          return;
        }
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
      String(correlated),
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

test("structured logs carry isolated trusted request context and leave background events unscoped", (): void => {
  const output = captureLogs("production", true);
  const schema = entrySchema.extend({
    message: entrySchema.shape.message.extend({
      requestId: z.string().optional(),
      userId: z.string().nullable().optional(),
    }),
  });
  const entries = [
    ...output.stdout.trim().split("\n"),
    ...output.stderr.trim().split("\n"),
  ].map((line: string): z.infer<typeof schema> =>
    schema.parse(JSON.parse(line)),
  );
  assert.equal(entries.length, 7);
  for (const id of ["a", "b"]) {
    const scoped = entries.filter(
      (entry: z.infer<typeof schema>): boolean =>
        entry.message.requestId === `context-${id}`,
    );
    assert.equal(scoped.length, 3);
    assert.ok(
      scoped.every(
        (entry: z.infer<typeof schema>): boolean =>
          entry.message.userId === `user-${id}`,
      ),
    );
  }
  assert.equal(
    entries.filter(
      (entry: z.infer<typeof schema>): boolean =>
        entry.message.requestId === undefined,
    ).length,
    1,
  );
  assert.doesNotMatch(JSON.stringify(entries), /forged/);
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
