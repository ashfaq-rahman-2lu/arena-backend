import { PaddleOcrVisionAdapter } from "../src/extraction/paddle-ocr-vision.adapter";
import { OcrProcess } from "../src/extraction/paddle-ocr-process.adapter";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import assert from "node:assert/strict";
import { test } from "node:test";
import { GoogleOAuthAdapter } from "../src/auth/google-oauth.adapter";
import { ApplicationError } from "../src/common/application-error";
import { HttpTransport } from "../src/common/fetch-http.adapter";
import {
  offlineEnvironment,
  validateConfiguration,
} from "../src/config/configuration";
import { ConfigurationService } from "../src/config/configuration.service";
for (const scenario of ["malformed token", "unverified identity", "timeout"])
  test(`Google adapter safely rejects ${scenario} through injected transport`, async (): Promise<void> => {
    let calls = 0;
    const transport: HttpTransport = {
      send: async (_url: string, options: RequestInit): Promise<Response> => {
        calls++;
        assert(options.signal instanceof AbortSignal);
        if (scenario === "timeout")
          throw new DOMException("provider secret", "TimeoutError");
        return new Response(
          JSON.stringify(
            calls === 1
              ? scenario === "malformed token"
                ? { access_token: 12 }
                : { access_token: "secret" }
              : {
                  sub: "subject",
                  email: "admin@example.test",
                  email_verified: false,
                },
          ),
          { status: 200 },
        );
      },
    };
    const config = new ConfigurationService(
      new ConfigService({
        arena: validateConfiguration({
          ...offlineEnvironment,
          GOOGLE_CLIENT_ID: "client",
          GOOGLE_CLIENT_SECRET: "secret",
          GOOGLE_CALLBACK_URL:
            "http://localhost:5173/api/v1/auth/google/callback",
        }),
      }),
    );
    const module = await Test.createTestingModule({
      providers: [
        GoogleOAuthAdapter,
        { provide: ConfigurationService, useValue: config },
        { provide: HttpTransport, useValue: transport },
      ],
    }).compile();
    try {
      await assert.rejects(
        module.get(GoogleOAuthAdapter).identity("code"),
        (error: unknown): boolean =>
          error instanceof ApplicationError &&
          error.code === "OAUTH_INVALID" &&
          !error.message.includes("secret"),
      );
    } finally {
      await module.close();
    }
  });

for (const scenario of ["timeout", "malformed envelope", "malformed score"])
  test(`PaddleOCR adapter safely rejects ${scenario} through injected process`, async (): Promise<void> => {
    const process: OcrProcess = {
      run: async (_python: string, _image: Buffer): Promise<string> => {
        if (scenario === "timeout") throw new Error("provider secret");
        return scenario === "malformed envelope"
          ? "not json"
          : JSON.stringify({
              homeScore: -1,
              awayScore: 2,
              stats: [],
              warnings: [],
            });
      },
    };
    const config = new ConfigurationService(
      new ConfigService({ arena: validateConfiguration(offlineEnvironment) }),
    );
    const module = await Test.createTestingModule({
      providers: [
        PaddleOcrVisionAdapter,
        { provide: ConfigurationService, useValue: config },
        { provide: OcrProcess, useValue: process },
      ],
    }).compile();
    try {
      await assert.rejects(
        module.get(PaddleOcrVisionAdapter).read(Buffer.from("test"), []),
        (error: unknown): boolean =>
          error instanceof ApplicationError &&
          error.code === "INTEGRATION_UNAVAILABLE" &&
          !error.message.includes("secret"),
      );
    } finally {
      await module.close();
    }
  });
test("PaddleOCR returns positional scores with no name matching or HTTP request", async (): Promise<void> => {
  const config = new ConfigurationService(
    new ConfigService({
      arena: validateConfiguration({
        ...offlineEnvironment,
        PADDLEOCR_PYTHON: "/opt/ocr/bin/python",
      }),
    }),
  );
  const process: OcrProcess = {
    run: async (python: string, image: Buffer): Promise<string> => {
      assert.equal(python, "/opt/ocr/bin/python");
      assert.equal(image.toString(), "image");
      return JSON.stringify({
        homeScore: 1,
        awayScore: 2,
        warnings: [],
        stats: [
          {
            key: "possession",
            label: "Possession",
            home: 55,
            away: 45,
            unit: "percent",
          },
          {
            key: "passes",
            label: "Passes",
            home: 115,
            away: null,
            unit: "count",
          },
        ],
      });
    },
  };
  const result = await new PaddleOcrVisionAdapter(config, process).read(
    Buffer.from("image"),
    [],
  );
  assert.deepEqual(Reflect.get(result, "stats"), [
    {
      key: "possession",
      label: "Possession",
      home: 55,
      away: 45,
      unit: "percent",
    },
    { key: "passes", label: "Passes", home: 115, away: null, unit: "count" },
  ]);
  assert.deepEqual(result.sides, [
    { name: null, score: 1, tiebreak: null },
    { name: null, score: 2, tiebreak: null },
  ]);
});

for (const stats of [
  [
    {
      key: "possession",
      label: "Possession",
      home: 101,
      away: 45,
      unit: "percent",
    },
  ],
  [{ key: "passes", label: "Passes", home: -1, away: 79, unit: "count" }],
  [{ key: "passes", label: "Passes", home: 115, away: 79, unit: "percent" }],
]) {
  test(`rejects invalid stat payload ${JSON.stringify(stats)}`, async (): Promise<void> => {
    const config = new ConfigurationService(
      new ConfigService({ arena: validateConfiguration(offlineEnvironment) }),
    );
    const process: OcrProcess = {
      run: async (_python: string, _image: Buffer): Promise<string> =>
        JSON.stringify({ homeScore: 1, awayScore: 2, stats, warnings: [] }),
    };
    await assert.rejects(
      new PaddleOcrVisionAdapter(config, process).read(
        Buffer.from("image"),
        [],
      ),
      ApplicationError,
    );
  });
}
