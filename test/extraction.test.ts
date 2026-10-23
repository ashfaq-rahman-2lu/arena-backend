import { Logger } from "@nestjs/common";
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { extracted, VisionProvider } from "../src/extraction/extraction.models";
import {
  ExtractionService as Extraction,
  mapExtraction,
} from "../src/extraction/extraction.service";
const logger = new Logger();
Logger.overrideLogger(false);
const entrants = [
  { id: "a", name: "Red Dragons", aliases: ["gamer-red"], groupId: null },
  { id: "b", name: "Blue Knights", aliases: ["gamer-blue"], groupId: null },
];
test("assigns left score to home and right score to away without matching names", (): void => {
  const result = mapExtraction(
    {
      sides: [
        { name: "Unrelated name", score: 1, tiebreak: null },
        { name: null, score: 2, tiebreak: null },
      ],
      warnings: [],
    },
    entrants,
  );
  assert.equal(result.matched, true);
  assert.equal(result.homeScore, 1);
  assert.equal(result.awayScore, 2);
  assert.deepEqual(result.warnings, []);
});
test("unreadable positional scores stay null while zero is preserved", (): void => {
  const result = mapExtraction(
    {
      sides: [
        { name: null, score: null, tiebreak: null },
        { name: null, score: 0, tiebreak: null },
      ],
      warnings: ["Unreadable home score"],
    },
    entrants,
  );
  assert.equal(result.matched, true);
  assert.equal(result.homeScore, null);
  assert.equal(result.awayScore, 0);
  assert.deepEqual(result.warnings, ["Unreadable home score"]);
});
test("validates image contents before invoking the provider", async (): Promise<void> => {
  let called = false;
  const provider: VisionProvider = {
    async read(): Promise<{
      sides: {
        name: string;
        score: number;
        tiebreak: null;
      }[];
      warnings: never[];
    }> {
      called = true;
      return {
        sides: [
          { name: "Red Dragons", score: 1, tiebreak: null },
          { name: "Blue Knights", score: 0, tiebreak: null },
        ],
        warnings: [],
      };
    },
  };
  const service = new Extraction(provider, logger);
  await assert.rejects(
    (): Promise<{
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
    }> =>
      service.read(
        {
          buffer: Buffer.from("not an image"),
          size: 12,
        } as Express.Multer.File,
        entrants,
      ),
    /valid, non-animated/,
  );
  assert.equal(called, false);
  await assert.rejects(
    (): Promise<{
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
    }> =>
      service.read(
        {
          buffer: Buffer.alloc(1),
          size: 11 * 1024 * 1024,
        } as Express.Multer.File,
        entrants,
      ),
    /up to 10 MB/,
  );
  const image = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const result = await service.read(
    { buffer: image, size: image.length } as Express.Multer.File,
    entrants,
  );
  assert.equal(called, true);
  assert.equal(result.homeScore, 1);
});
test("provider failures leave manual entry available", async (): Promise<void> => {
  const service = new Extraction(
    {
      async read(): Promise<never> {
        throw new Error("timeout");
      },
    },
    logger,
  );
  const image = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    (): Promise<{
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
    }> =>
      service.read(
        { buffer: image, size: image.length } as Express.Multer.File,
        entrants,
      ),
    /enter scores manually/,
  );
});

test(
  "local PaddleOCR process extracts the reference screenshot through the application service",
  {
    skip: process.env.PADDLEOCR_INTEGRATION !== "1",
  },
  async (): Promise<void> => {
    const { readFile } = await import("node:fs/promises");
    const { PaddleOcrProcessAdapter } =
      await import("../src/extraction/paddle-ocr-process.adapter");
    const { PaddleOcrVisionAdapter } =
      await import("../src/extraction/paddle-ocr-vision.adapter");
    const { ConfigurationService } =
      await import("../src/config/configuration.service");
    const { ConfigService } = await import("@nestjs/config");
    const { offlineEnvironment, validateConfiguration } =
      await import("../src/config/configuration");
    const config = new ConfigurationService(
      new ConfigService({
        arena: validateConfiguration({
          ...offlineEnvironment,
          PADDLEOCR_PYTHON:
            process.env.PADDLEOCR_PYTHON || ".venv-ocr/bin/python",
        }),
      }),
    );
    const worker = new PaddleOcrProcessAdapter(config, new Logger());
    const service = new Extraction(
      new PaddleOcrVisionAdapter(config, worker),
      logger,
    );
    try {
      const image = await readFile("test/fixtures/scorer_image.jpg");
      const result = await service.read(
        { buffer: image, size: image.length } as Express.Multer.File,
        entrants,
      );
      assert.equal(result.homeScore, 1);
      assert.equal(result.awayScore, 2);
      assert.equal(result.matched, true);
      assert.equal(result.stats.length, 13);
      assert.deepEqual(
        result.stats.find(
          (
            stat: import("../src/extraction/extraction.models").MatchStat,
          ): boolean => stat.key === "passes",
        ),
        {
          key: "passes",
          label: "Passes",
          home: 115,
          away: 79,
          unit: "count",
        },
      );
      assert.deepEqual(result.warnings, []);
      const repeated = await service.read(
        { buffer: image, size: image.length } as Express.Multer.File,
        entrants,
      );
      assert.deepEqual(repeated, result);
      const bordered = await readFile(
        "test/fixtures/scorer_image_bordered.jpg",
      );
      const borderedResult = await service.read(
        { buffer: bordered, size: bordered.length } as Express.Multer.File,
        entrants,
      );
      assert.equal(borderedResult.homeScore, 4);
      assert.equal(borderedResult.awayScore, 5);
      assert.equal(borderedResult.stats.length, 13);
      assert.deepEqual(borderedResult.warnings, []);
    } finally {
      await worker.onModuleDestroy();
    }
  },
);

test("stat suggestions survive provider validation and positional mapping", (): void => {
  const stats = [
    { key: "offsides", label: "Offsides", home: 1, away: 0, unit: "count" },
  ];
  const result = mapExtraction(
    extracted.parse({
      sides: [
        { name: null, score: 1, tiebreak: null },
        { name: null, score: 2, tiebreak: null },
      ],
      warnings: [],
      stats,
    }),
    entrants,
  );
  assert.deepEqual(Reflect.get(result, "stats"), stats);
});
