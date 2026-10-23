import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigurationService } from "../config/configuration.service";
import { execFile, ExecFileException } from "node:child_process";
import { resolve } from "node:path";

export abstract class OcrProcess {
  abstract run(python: string, image: Buffer): Promise<string>;
}

@Injectable()
export class PaddleOcrProcessAdapter extends OcrProcess {
  constructor(
    private readonly config: ConfigurationService,
    @Inject(Logger) private readonly log: Logger,
  ) {
    super();
  }
  run(python: string, image: Buffer): Promise<string> {
    const started = Date.now();
    return new Promise(
      (
        resolveOutput: (value: string) => void,
        reject: (reason: Error) => void,
      ): void => {
        // No shell, filenames, or uploaded text are interpolated into commands.
        const child = execFile(
          python,
          [resolve("ocr/score_reader.py")],
          {
            timeout: this.config.values.vision.timeoutMs,
            killSignal: "SIGKILL",
            maxBuffer: 64 * 1024,
          },
          (error: ExecFileException | null, stdout: string): void => {
            if (error) {
              const reason =
                error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
                  ? "output_limit"
                  : error.killed
                    ? "timeout"
                    : error.code === "ENOENT" || error.code === "EACCES"
                      ? "spawn_failed"
                      : "process_exit";
              this.log.warn(
                JSON.stringify({
                  event: "ocr_process_failure",
                  reason,
                  ms: Date.now() - started,
                  timeoutMs: this.config.values.vision.timeoutMs,
                  exitCode: typeof error.code === "number" ? error.code : null,
                  signal: error.signal ?? null,
                }),
              );
              reject(new Error("Local OCR process unavailable"));
            } else resolveOutput(stdout);
          },
        );
        child.stdin?.on("error", (): void => {
          /* Process exit is handled by execFile. */
        });
        child.stdin?.end(image);
      },
    );
  }
}
