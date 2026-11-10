import { Inject, Injectable, Logger } from "@nestjs/common";
import { RequestContextService } from "./request-context.service";

export type TimedOperation =
  | "session.resolve"
  | "tournament.load"
  | "tournament.public"
  | "tournament.preview"
  | "tournament.list"
  | "tournament.lock"
  | "tournament.transaction"
  | "tournament.response"
  | "following.list";
export interface OperationTiming {
  event: "operation_timing";
  requestId: string;
  operation: TimedOperation;
  durationMs: number;
  outcome: "completed" | "failed";
}
@Injectable()
export class OperationTimingService {
  constructor(
    private readonly requests: RequestContextService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}
  async measure<T>(
    operation: TimedOperation,
    work: () => Promise<T>,
  ): Promise<T> {
    const started = performance.now();
    let outcome: OperationTiming["outcome"] = "failed";
    try {
      const result = await work();
      outcome = "completed";
      return result;
    } finally {
      this.record(operation, started, outcome);
    }
  }
  sync<T>(operation: TimedOperation, work: () => T): T {
    const started = performance.now();
    let outcome: OperationTiming["outcome"] = "failed";
    try {
      const result = work();
      outcome = "completed";
      return result;
    } finally {
      this.record(operation, started, outcome);
    }
  }
  private record(
    operation: TimedOperation,
    started: number,
    outcome: OperationTiming["outcome"],
  ): void {
    const correlation = this.requests.correlation();
    if (!correlation) return;
    const event: OperationTiming = {
      event: "operation_timing",
      requestId: correlation.requestId,
      operation,
      durationMs: performance.now() - started,
      outcome,
    };
    this.logger.log(event);
  }
}
