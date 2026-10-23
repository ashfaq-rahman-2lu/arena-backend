import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  validateConfiguration,
  offlineEnvironment,
} from "../src/config/configuration";
import { ConfigurationService } from "../src/config/configuration.service";
import { PaddleOcrProcessAdapter } from "../src/extraction/paddle-ocr-process.adapter";

test("OCR enforces configured timeout and logs only safe failure metadata", async (): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), "arena-ocr-timeout-"));
  const executable = join(directory, "fake-python");
  await writeFile(
    executable,
    `#!${process.execPath}\nprocess.stdin.resume(); setTimeout(() => {process.stdout.write("{}"); process.exit(0);}, 300);\n`,
    { mode: 0o700 },
  );
  const logs: string[] = [];
  const config = new ConfigurationService(
    new ConfigService({
      arena: validateConfiguration({
        ...offlineEnvironment,
        PADDLEOCR_TIMEOUT_MS: "50",
      }),
    }),
  );
  const module = await Test.createTestingModule({
    providers: [
      PaddleOcrProcessAdapter,
      { provide: ConfigurationService, useValue: config },
      {
        provide: Logger,
        useValue: {
          warn: (message: string): void => {
            logs.push(message);
          },
        },
      },
    ],
  }).compile();
  try {
    await assert.rejects(
      module
        .get(PaddleOcrProcessAdapter)
        .run(executable, Buffer.from("private-image-bytes")),
    );
    assert.equal(logs.length, 1);
    assert.match(logs[0], /"reason":"timeout"/);
    assert.ok(!logs[0].includes("private-image-bytes"));
    assert.ok(!logs[0].includes(executable));
  } finally {
    await module.close();
    await rm(directory, { recursive: true, force: true });
  }
});
