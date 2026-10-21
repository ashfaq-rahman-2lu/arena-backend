export type MapExtractionResult = {
  matched: boolean;
  observedSides: {
    name: string | null;
    score: number | null;
    tiebreak: number | null;
  }[];
  homeScore: number | null;
  awayScore: number | null;
  homeTiebreak: number | null;
  awayTiebreak: number | null;
  warnings: string[];
};
export type ReadResult = {
  matched: boolean;
  observedSides: {
    name: string | null;
    score: number | null;
    tiebreak: number | null;
  }[];
  homeScore: number | null;
  awayScore: number | null;
  homeTiebreak: number | null;
  awayTiebreak: number | null;
  warnings: string[];
};
import { Inject, Injectable, Logger } from "@nestjs/common";
import sharp from "sharp";
import { ApplicationError } from "../common/application-error";
import { Entrant } from "../domain/engine";
import { Extracted, extracted, VisionProvider } from "./extraction.models";
// The supported scorecard template always shows home on the left, away on the right.
export function mapExtraction(
  result: Extracted,
  _entrants: Entrant[],
): MapExtractionResult {
  return {
    matched: true,
    observedSides: result.sides,
    homeScore: result.sides[0].score,
    awayScore: result.sides[1].score,
    homeTiebreak: null,
    awayTiebreak: null,
    warnings: result.warnings,
  };
}
@Injectable()
export class ExtractionService {
  constructor(
    @Inject(VisionProvider)
    private readonly provider: VisionProvider,
    @Inject(Logger)
    private readonly log: Logger,
  ) {}
  async read(
    file: Express.Multer.File | undefined,
    entrants: Entrant[],
  ): Promise<ReadResult> {
    if (!file || file.size > 10 * 1024 * 1024)
      throw new ApplicationError(
        "VALIDATION_FAILED",
        400,
        "Upload one image up to 10 MB",
      );
    let image: Buffer;
    try {
      const decoder = sharp(file.buffer, { limitInputPixels: 40000000 });
      const meta = await decoder.metadata();
      if (
        !meta.format ||
        !["jpeg", "png", "webp"].includes(meta.format) ||
        (meta.pages || 1) > 1
      )
        throw new Error("Unsupported image");
      image = await decoder
        .rotate()
        .resize({
          width: 2048,
          height: 2048,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
    } catch {
      throw new ApplicationError(
        "VALIDATION_FAILED",
        400,
        "Use a valid, non-animated JPEG, PNG or WebP image",
      );
    }
    const start = Date.now();
    try {
      const result = mapExtraction(
        extracted.parse(await this.provider.read(image, entrants)),
        entrants,
      );
      this.log.log(
        JSON.stringify({
          event: "extraction",
          ok: true,
          ms: Date.now() - start,
        }),
      );
      return result;
    } catch (e) {
      this.log.warn(
        JSON.stringify({
          event: "extraction",
          ok: false,
          ms: Date.now() - start,
        }),
      );
      if (e instanceof ApplicationError) throw e;
      throw new ApplicationError(
        "INTEGRATION_UNAVAILABLE",
        503,
        "Could not read this scorecard. Retry or enter scores manually.",
      );
    }
  }
}
