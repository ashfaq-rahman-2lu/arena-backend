import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { z } from "zod";
import { HttpTransport } from "../src/common/fetch-http.adapter";
import {
  offlineEnvironment,
  validateConfiguration,
} from "../src/config/configuration";
import { ConfigurationService } from "../src/config/configuration.service";
import { VisionProvider } from "../src/extraction/extraction.models";
import {
  ExtractionService as Extraction,
  mapExtraction,
} from "../src/extraction/extraction.service";
import { OpenAIVisionAdapter as OpenAIVision } from "../src/extraction/open-ai-vision.adapter";
const logger = new Logger();
Logger.overrideLogger(false);
const entrants = [
  { id: "a", name: "Red Dragons", aliases: ["gamer-red"], groupId: null },
  { id: "b", name: "Blue Knights", aliases: ["gamer-blue"], groupId: null },
];
test("maps reversed names and normalized in-game aliases to the selected match", (): void => {
  const suggestion = mapExtraction(
    {
      sides: [
        { name: " Gamer BLUE ", score: 2, tiebreak: null },
        { name: "gamer-red", score: 5, tiebreak: null },
      ],
      warnings: [],
    },
    entrants,
  );
  assert.equal(suggestion.matched, true);
  assert.equal(suggestion.homeScore, 5);
  assert.equal(suggestion.awayScore, 2);
});
test("ambiguous names never silently assign scores", (): void => {
  const suggestion = mapExtraction(
    {
      sides: [
        { name: "Unknown", score: 2, tiebreak: null },
        { name: "Unknown", score: 5, tiebreak: null },
      ],
      warnings: [],
    },
    entrants,
  );
  assert.equal(suggestion.matched, false);
  assert.equal(suggestion.homeScore, null);
  assert(suggestion.warnings.length);
});
test("shared aliases are ambiguous even if one display name matches", (): void => {
  const s = mapExtraction(
    {
      sides: [
        { name: "shared", score: 2, tiebreak: null },
        { name: "Blue Knights", score: 5, tiebreak: null },
      ],
      warnings: [],
    },
    entrants.map(
      (e: {
        id: string;
        name: string;
        aliases: string[];
        groupId: null;
      }): {
        aliases: string[];
        id: string;
        name: string;
        groupId: null;
      } => ({ ...e, aliases: ["shared"] }),
    ),
  );
  assert.equal(s.matched, false);
});
test("unreadable values stay null", (): void => {
  const s = mapExtraction(
    {
      sides: [
        { name: "Red Dragons", score: null, tiebreak: null },
        { name: "Blue Knights", score: 0, tiebreak: null },
      ],
      warnings: ["Unreadable score"],
    },
    entrants,
  );
  assert.equal(s.homeScore, null);
  assert.equal(s.awayScore, 0);
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
test("OpenAI adapter uses a 30 second timeout, schema output, no tools and transient inputs", async (): Promise<void> => {
  let captured: RequestInit | undefined;
  const transport: HttpTransport = {
    send: async (_url: string, options: RequestInit): Promise<Response> => {
      captured = options;
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    sides: [
                      { name: "Red Dragons", score: 2, tiebreak: null },
                      { name: "Blue Knights", score: 1, tiebreak: null },
                    ],
                    warnings: [],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    },
  };
  const config = new ConfigurationService(
    new ConfigService({
      arena: validateConfiguration({
        ...offlineEnvironment,
        OPENAI_API_KEY: "test-key",
      }),
    }),
  );
  {
    const result = await new OpenAIVision(config, transport, logger).read(
      Buffer.from("test"),
      entrants,
    );
    assert.equal(result.sides[0].score, 2);
    assert(captured);
    const body = z
      .object({
        store: z.boolean(),
        text: z.object({ format: z.object({ strict: z.boolean() }) }),
        tools: z.unknown().optional(),
      })
      .parse(JSON.parse(String(captured.body)));
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.tools, undefined);
    assert(captured.signal);
  }
});
