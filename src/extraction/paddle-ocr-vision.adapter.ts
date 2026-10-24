import { Inject, Injectable } from "@nestjs/common";
import { ocrResultSchema as resultSchema } from "./ocr-worker.models";
import { ApplicationError } from "../common/application-error";
import { ConfigurationService } from "../config/configuration.service";
import { Entrant } from "../domain/engine";
import { Extracted, ExtractionMode, VisionProvider } from "./extraction.models";
import { OcrProcess } from "./paddle-ocr-process.adapter";

@Injectable()
export class PaddleOcrVisionAdapter extends VisionProvider {
  constructor(
    private readonly config: ConfigurationService,
    @Inject(OcrProcess) private readonly process: OcrProcess,
  ) {
    super();
  }

  async read(
    image: Buffer,
    _entrants: Entrant[],
    mode: ExtractionMode = "full",
  ): Promise<Extracted> {
    try {
      const result = resultSchema.parse(
        JSON.parse(
          await this.process.run(this.config.values.vision.python, image, mode),
        ),
      );
      return {
        sides: [
          { name: null, score: result.homeScore, tiebreak: null },
          { name: null, score: result.awayScore, tiebreak: null },
        ],
        stats: result.stats,
        warnings: result.warnings,
      };
    } catch {
      throw new ApplicationError(
        "INTEGRATION_UNAVAILABLE",
        503,
        "Could not read this scorecard with PaddleOCR. Retry or enter scores manually.",
      );
    }
  }
}
