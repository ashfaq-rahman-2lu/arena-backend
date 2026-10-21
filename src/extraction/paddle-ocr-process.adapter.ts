import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

export abstract class OcrProcess {
  abstract run(python: string, image: Buffer): Promise<string>;
}

@Injectable()
export class PaddleOcrProcessAdapter extends OcrProcess {
  run(python: string, image: Buffer): Promise<string> {
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
            timeout: 30000,
            killSignal: "SIGKILL",
            maxBuffer: 64 * 1024,
          },
          (error: Error | null, stdout: string): void => {
            if (error) reject(new Error("Local OCR process unavailable"));
            else resolveOutput(stdout);
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
