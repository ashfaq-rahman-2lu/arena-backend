import { ChildProcessWithoutNullStreams } from "node:child_process";
import { z } from "zod";
import { ExtractionMode, matchStats } from "./extraction.models";

const score = z.number().int().min(0).max(99).nullable();
export const ocrResultSchema = z.object({
  homeScore: score,
  awayScore: score,
  stats: matchStats,
  warnings: z.array(z.string().max(500)).max(40),
});
const milliseconds = z.number().finite().nonnegative();
export const workerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), modelLoadMs: milliseconds }),
  z.object({
    type: z.literal("result"),
    result: ocrResultSchema,
    timings: z.object({ prepareMs: milliseconds, inferenceMs: milliseconds }),
  }),
  z.object({ type: z.literal("error") }),
]);
export interface OcrJob {
  image: Buffer;
  mode: ExtractionMode;
  started: number;
  dispatched: number;
  timer: ReturnType<typeof setTimeout>;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
}
export interface OcrWorker {
  child: ChildProcessWithoutNullStreams;
  python: string;
  ready: boolean;
  failed: boolean;
  buffer: Buffer;
  started: number;
  timer: ReturnType<typeof setTimeout>;
}
