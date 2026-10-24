import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ConfigurationService } from "../config/configuration.service";
import { OcrJob, OcrWorker, workerMessageSchema } from "./ocr-worker.models";
import { ExtractionMode } from "./extraction.models";

export abstract class OcrProcess {
  abstract run(
    python: string,
    image: Buffer,
    mode?: ExtractionMode,
  ): Promise<string>;
}
const MAX_JOBS = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;

@Injectable()
export class PaddleOcrProcessAdapter
  extends OcrProcess
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private worker: OcrWorker | null = null;
  private active: OcrJob | null = null;
  private readonly waiting: OcrJob[] = [];
  private stopped = false;

  constructor(
    private readonly config: ConfigurationService,
    @Inject(Logger) private readonly log: Logger,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    // Optional OCR must not block API/manual-score availability or offline schema generation.
    if (this.config.values.environment !== "test")
      this.ensureWorker(this.config.values.vision.python);
  }

  run(
    python: string,
    image: Buffer,
    mode: ExtractionMode = "full",
  ): Promise<string> {
    if (
      this.stopped ||
      image.length > MAX_IMAGE_BYTES ||
      this.waiting.length + (this.active ? 1 : 0) >= MAX_JOBS
    )
      return Promise.reject(new Error("Local OCR process unavailable"));
    const worker = this.ensureWorker(python);
    if (worker.failed || worker.python !== python)
      return Promise.reject(new Error("Local OCR process unavailable"));
    return new Promise(
      (
        resolveOutput: (value: string) => void,
        reject: (reason: Error) => void,
      ): void => {
        const job: OcrJob = {
          image,
          mode,
          started: Date.now(),
          dispatched: 0,
          resolve: resolveOutput,
          reject,
          timer: setTimeout(
            (): void => this.expire(worker, job),
            this.config.values.vision.timeoutMs,
          ),
        };
        this.waiting.push(job);
        this.dispatch(worker);
      },
    );
  }

  private ensureWorker(python: string): OcrWorker {
    if (this.worker) return this.worker;
    const child = spawn(python, [resolve("ocr/score_reader.py"), "--worker"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const worker: OcrWorker = {
      child,
      python,
      ready: false,
      failed: false,
      buffer: Buffer.alloc(0),
      started: Date.now(),
      timer: setTimeout(
        (): void => this.fail(worker, "timeout"),
        this.config.values.vision.timeoutMs,
      ),
    };
    this.worker = worker;
    // Drain diagnostics without retaining or exposing arbitrary Python output.
    child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer): void =>
      this.receive(worker, chunk),
    );
    child.stdin.on("error", (): void => this.fail(worker, "input_failure"));
    child.on("error", (): void => this.fail(worker, "spawn_failed"));
    child.on(
      "close",
      (code: number | null, signal: NodeJS.Signals | null): void => {
        if (!worker.failed) this.fail(worker, "process_exit", code, signal);
        if (this.worker === worker) this.worker = null;
      },
    );
    return worker;
  }

  private dispatch(worker: OcrWorker): void {
    if (
      this.worker !== worker ||
      worker.failed ||
      !worker.ready ||
      this.active ||
      this.stopped
    )
      return;
    const job = this.waiting.shift();
    if (!job) return;
    this.active = job;
    job.dispatched = Date.now();
    const header = Buffer.alloc(4);
    // The high bit selects score-only mode; the remaining 31 bits hold image size.
    header.writeUInt32BE(
      job.image.length + (job.mode === "scores" ? 0x80000000 : 0),
    );
    worker.child.stdin.write(
      Buffer.concat([header, job.image]),
      (error: Error | null | undefined): void => {
        if (error) this.fail(worker, "input_failure");
      },
    );
  }

  private receive(worker: OcrWorker, chunk: Buffer): void {
    if (this.worker !== worker || worker.failed) return;
    worker.buffer = Buffer.concat([worker.buffer, chunk]);
    let newline = worker.buffer.indexOf(10);
    while (newline !== -1) {
      if (newline > MAX_OUTPUT_BYTES) {
        this.fail(worker, "output_limit");
        return;
      }
      const line = worker.buffer.subarray(0, newline).toString("utf8");
      worker.buffer = worker.buffer.subarray(newline + 1);
      try {
        const message = workerMessageSchema.parse(JSON.parse(line));
        if (message.type === "ready" && !worker.ready) {
          worker.ready = true;
          clearTimeout(worker.timer);
          this.log.log({
            event: "ocr_worker_ready",
            startupMs: Date.now() - worker.started,
            modelLoadMs: message.modelLoadMs,
          });
          this.dispatch(worker);
        } else if (message.type === "result" && worker.ready && this.active) {
          const job = this.active;
          this.active = null;
          clearTimeout(job.timer);
          this.log.log({
            event: "ocr_phases",
            mode: job.mode,
            cells: job.mode === "scores" ? 2 : 28,
            queueMs: job.dispatched - job.started,
            totalMs: Date.now() - job.started,
            ...message.timings,
          });
          job.resolve(JSON.stringify(message.result));
          this.dispatch(worker);
        } else {
          this.fail(worker, "protocol_failure");
          return;
        }
      } catch {
        this.fail(worker, "protocol_failure");
        return;
      }
      if (worker.failed) return;
      newline = worker.buffer.indexOf(10);
    }
    if (worker.buffer.length > MAX_OUTPUT_BYTES)
      this.fail(worker, "output_limit");
  }

  private expire(worker: OcrWorker, job: OcrJob): void {
    if (this.active === job || !worker.ready) {
      this.fail(worker, "timeout");
      return;
    }
    const index = this.waiting.indexOf(job);
    if (index !== -1) {
      this.waiting.splice(index, 1);
      this.log.warn({
        event: "ocr_process_failure",
        reason: "queue_timeout",
        ms: Date.now() - job.started,
      });
      job.reject(new Error("Local OCR process unavailable"));
    }
  }

  private fail(
    worker: OcrWorker,
    reason: string,
    exitCode: number | null = null,
    signal: NodeJS.Signals | null = null,
  ): void {
    if (this.worker !== worker || worker.failed) return;
    worker.failed = true;
    clearTimeout(worker.timer);
    if (reason !== "shutdown")
      this.log.warn({
        event: "ocr_process_failure",
        reason,
        ms: Date.now() - worker.started,
        timeoutMs: this.config.values.vision.timeoutMs,
        exitCode,
        signal,
      });
    const jobs = this.active
      ? [this.active, ...this.waiting]
      : [...this.waiting];
    this.active = null;
    this.waiting.length = 0;
    for (const job of jobs) {
      clearTimeout(job.timer);
      job.reject(new Error("Local OCR process unavailable"));
    }
    worker.buffer = Buffer.alloc(0);
    worker.child.kill("SIGKILL");
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    const worker = this.worker;
    if (!worker) return;
    await new Promise<void>((done: () => void): void => {
      worker.child.once("close", (): void => done());
      this.fail(worker, "shutdown");
    });
  }
}
