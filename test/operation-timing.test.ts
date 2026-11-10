import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import assert from "node:assert/strict";
import { test } from "node:test";
import { OperationTimingService } from "../src/common/operation-timing.service";
import { RequestContextService } from "../src/common/request-context.service";
import { RequestContext } from "../src/common/request-context.models";

test("operation timings preserve results and errors and isolate concurrent request IDs", async (): Promise<void> => {
  const events: unknown[] = [];
  const module = await Test.createTestingModule({
    providers: [
      OperationTimingService,
      RequestContextService,
      {
        provide: Logger,
        useValue: {
          log: (event: unknown): void => {
            events.push(event);
          },
        },
      },
    ],
  }).compile();
  try {
    const requests = module.get(RequestContextService),
      timing = module.get(OperationTimingService);
    const context = (requestId: string): RequestContext => ({
      requestId,
      userId: null,
      errorCode: null,
      errorType: null,
    });
    const failure = new Error("private-secret");
    await Promise.all([
      requests.run(context("first"), async (): Promise<void> => {
        assert.equal(
          await timing.measure("session.resolve", async (): Promise<number> => {
            await Promise.resolve();
            return 42;
          }),
          42,
        );
      }),
      requests.run(context("second"), async (): Promise<void> => {
        await assert.rejects(
          timing.measure("tournament.load", async (): Promise<never> => {
            throw failure;
          }),
          (error: unknown): boolean => error === failure,
        );
      }),
    ]);
    assert.equal(events.length, 2);
    assert.ok(!JSON.stringify(events).includes("private-secret"));
    for (const event of events) {
      assert.ok(event && typeof event === "object");
      assert.equal(Reflect.get(event, "event"), "operation_timing");
      assert.ok(Number(Reflect.get(event, "durationMs")) >= 0);
      assert.equal(
        Reflect.get(event, "outcome"),
        Reflect.get(event, "requestId") === "first" ? "completed" : "failed",
      );
    }
    await timing.measure("session.resolve", async (): Promise<void> => {});
    assert.equal(events.length, 2, "no uncorrelated noise");
  } finally {
    await module.close();
  }
});
