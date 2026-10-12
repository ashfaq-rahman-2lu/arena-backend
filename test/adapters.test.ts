import { Logger } from "@nestjs/common";
import { OpenAIVisionAdapter } from "../src/extraction/open-ai-vision.adapter";
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
  test(`vision adapter safely rejects ${scenario} through injected transport`, async (): Promise<void> => {
    const transport: HttpTransport = {
      send: async (_url: string, options: RequestInit): Promise<Response> => {
        assert(options.signal instanceof AbortSignal);
        if (scenario === "timeout")
          throw new DOMException("provider secret", "TimeoutError");
        return new Response(
          JSON.stringify(
            scenario === "malformed envelope"
              ? { output: "provider secret" }
              : {
                  output: [
                    {
                      content: [
                        {
                          type: "output_text",
                          text: JSON.stringify({
                            sides: [{ name: null, score: -1, tiebreak: null }],
                            warnings: [],
                          }),
                        },
                      ],
                    },
                  ],
                },
          ),
        );
      },
    };
    const config = new ConfigurationService(
      new ConfigService({
        arena: validateConfiguration({
          ...offlineEnvironment,
          OPENAI_API_KEY: "test-only",
        }),
      }),
    );
    const module = await Test.createTestingModule({
      providers: [
        OpenAIVisionAdapter,
        { provide: ConfigurationService, useValue: config },
        { provide: HttpTransport, useValue: transport },
        { provide: Logger, useValue: new Logger() },
      ],
    }).compile();
    try {
      await assert.rejects(
        module.get(OpenAIVisionAdapter).read(Buffer.from("test"), []),
        (error: unknown): boolean =>
          error instanceof ApplicationError &&
          error.code === "INTEGRATION_UNAVAILABLE" &&
          !error.message.includes("secret"),
      );
    } finally {
      await module.close();
    }
  });
