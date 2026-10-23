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
  const logs: unknown[] = [];
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
          warn: (message: unknown): void => {
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
    assert.ok(logs[0] && typeof logs[0] === "object");
    assert.equal(Reflect.get(logs[0], "reason"), "timeout");
    assert.ok(!JSON.stringify(logs).includes("private-image-bytes"));
    assert.ok(!JSON.stringify(logs).includes(executable));
  } finally {
    await module.close();
    await rm(directory, { recursive: true, force: true });
  }
});

const fakeWorker = `#!${process.execPath}
const fs = require('node:fs');
let buffer = Buffer.alloc(0);
process.stdout.write(JSON.stringify({type:'ready',modelLoadMs:12})+'\\n');
process.stdin.on('data', chunk => {
 buffer = Buffer.concat([buffer,chunk]);
 while(buffer.length>=4 && buffer.length>=4+buffer.readUInt32BE(0)) {
  const size=buffer.readUInt32BE(0);
  const value=buffer.subarray(4,4+size).toString(); buffer=buffer.subarray(4+size);
  if(value==='crash') { process.exit(1); return; }
  if(value==='hang') continue;
  if(value==='overflow') {process.stdout.write('x'.repeat(65537));continue;}
  if(value==='malformed') {process.stdout.write('not-json\\n');continue;}
  const result={homeScore:Number(value),awayScore:0,stats:[],warnings:[String(process.pid)]};
  setTimeout(()=>process.stdout.write(JSON.stringify({type:'result',result,timings:{prepareMs:1,inferenceMs:2}})+'\\n'),20);
 }
});
`;

interface WorkerFixture {
  adapter: PaddleOcrProcessAdapter;
  executable: string;
  logs: unknown[];
  close: () => Promise<void>;
}
async function workerFixture(timeout: number = 3000): Promise<WorkerFixture> {
  const directory = await mkdtemp(join(tmpdir(), "arena-ocr-worker-"));
  const executable = join(directory, "fake-python");
  await writeFile(executable, fakeWorker, { mode: 0o700 });
  const logs: unknown[] = [];
  const config = new ConfigurationService(
    new ConfigService({
      arena: validateConfiguration({
        ...offlineEnvironment,
        PADDLEOCR_TIMEOUT_MS: String(timeout),
      }),
    }),
  );
  const log = (message: unknown): void => {
    logs.push(message);
  };
  const module = await Test.createTestingModule({
    providers: [
      PaddleOcrProcessAdapter,
      { provide: ConfigurationService, useValue: config },
      { provide: Logger, useValue: { warn: log, log } },
    ],
  }).compile();
  return {
    adapter: module.get(PaddleOcrProcessAdapter),
    executable,
    logs,
    close: async (): Promise<void> => {
      await module.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("OCR worker reuses one process and keeps concurrent responses matched", async (): Promise<void> => {
  const fixture = await workerFixture();
  try {
    const outputs = await Promise.all([
      fixture.adapter.run(fixture.executable, Buffer.from("1")),
      fixture.adapter.run(fixture.executable, Buffer.from("2")),
    ]);
    assert.match(outputs[0], /"homeScore":1/);
    assert.match(outputs[1], /"homeScore":2/);
    const first: unknown = JSON.parse(outputs[0]);
    const second: unknown = JSON.parse(outputs[1]);
    assert.ok(
      first &&
        typeof first === "object" &&
        second &&
        typeof second === "object",
    );
    assert.deepEqual(
      Reflect.get(first, "warnings"),
      Reflect.get(second, "warnings"),
    );
    assert.ok(
      fixture.logs.some(
        (event: unknown): boolean =>
          typeof event === "object" &&
          event !== null &&
          Reflect.get(event, "event") === "ocr_worker_ready",
      ),
    );
    assert.ok(
      fixture.logs.some(
        (event: unknown): boolean =>
          typeof event === "object" &&
          event !== null &&
          Reflect.get(event, "inferenceMs") === 2,
      ),
    );
  } finally {
    await fixture.close();
  }
});
for (const failure of ["crash", "malformed", "hang", "overflow"]) {
  test(`OCR worker recovers after ${failure} without retrying the failed image`, async (): Promise<void> => {
    const fixture = await workerFixture(failure === "hang" ? 1500 : 3000);
    try {
      await assert.rejects(
        fixture.adapter.run(fixture.executable, Buffer.from(failure)),
      );
      // The child must finish closing before a replacement can start.
      await new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, 100);
      });
      assert.match(
        await fixture.adapter.run(fixture.executable, Buffer.from("3")),
        /"homeScore":3/,
      );
    } finally {
      await fixture.close();
    }
  });
}
test("OCR worker rejects work after application shutdown", async (): Promise<void> => {
  const fixture = await workerFixture();
  await fixture.close();
  await assert.rejects(
    fixture.adapter.run(fixture.executable, Buffer.from("1")),
  );
});

test("OCR bounds waiting requests and rejects all pending work on shutdown", async (): Promise<void> => {
  const fixture = await workerFixture();
  try {
    const pending = Promise.allSettled([
      fixture.adapter.run(fixture.executable, Buffer.from("hang")),
      fixture.adapter.run(fixture.executable, Buffer.from("1")),
      fixture.adapter.run(fixture.executable, Buffer.from("2")),
    ]);
    await assert.rejects(
      fixture.adapter.run(fixture.executable, Buffer.from("3")),
    );
    await fixture.adapter.onModuleDestroy();
    const results = await pending;
    assert.ok(
      results.every(
        (result: PromiseSettledResult<string>): boolean =>
          result.status === "rejected",
      ),
    );
  } finally {
    await fixture.close();
  }
});
