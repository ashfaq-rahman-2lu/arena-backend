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
import { Extracted, VisionProvider } from "./extraction.models";
export const normalize = (s: string): string =>
  s
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function mapExtraction(
  result: Extracted,
  entrants: Entrant[],
): MapExtractionResult {
  const indices = result.sides.map(
    (side: {
      name: string | null;
      score: number | null;
      tiebreak: number | null;
    }): number[] =>
      entrants
        .map((e: Entrant, i: number): number =>
          [e.name, ...e.aliases].some(
            (n: string): boolean =>
              normalize(n) !== "" &&
              normalize(n) === normalize(side.name || ""),
          )
            ? i
            : -1,
        )
        .filter((i: number): boolean => i >= 0),
  );
  const matched =
    indices.every((a: number[]): boolean => a.length === 1) &&
    indices[0][0] !== indices[1][0];
  const ordered = matched
    ? entrants.map(
        (
          _: Entrant,
          i: number,
        ): {
          name: string | null;
          score: number | null;
          tiebreak: number | null;
        } =>
          result.sides[indices.findIndex((a: number[]): boolean => a[0] === i)],
      )
    : null;
  return {
    matched,
    observedSides: result.sides,
    homeScore: ordered?.[0].score ?? null,
    awayScore: ordered?.[1].score ?? null,
    homeTiebreak: ordered?.[0].tiebreak ?? null,
    awayTiebreak: ordered?.[1].tiebreak ?? null,
    warnings: [
      ...result.warnings,
      ...(!matched
        ? [
            "Team names are ambiguous or unmatched. Map the observed sides before applying scores.",
          ]
        : []),
    ],
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
        await this.provider.read(image, entrants),
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
