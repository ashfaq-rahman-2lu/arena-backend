import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";

import { ExpressAdapter } from "@nestjs/platform-express";
import { SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AccessGuard } from "./auth/access.guard";
import { OAuthPort } from "./auth/google-oauth.adapter";
import { RateGuard } from "./auth/rate.guard";
import { EmailPort } from "./auth/smtp-email.adapter";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { HttpTransport } from "./common/fetch-http.adapter";
import { ConfigurationService } from "./config/configuration.service";
import { VisionProvider } from "./extraction/extraction.models";
import { documentation } from "./swagger";
export interface ApplicationOptions {
  environment: Record<string, unknown>;
  email?: EmailPort;
  oauth?: OAuthPort;
  vision?: VisionProvider;
  http?: HttpTransport;
}
export async function createApp(
  options: ApplicationOptions,
): Promise<INestApplication> {
  const module = AppModule.register(options.environment);
  const server = express();
  const adapter = new ExpressAdapter(server);
  let app: INestApplication;
  if (options.email || options.oauth || options.vision || options.http) {
    const { Test } = await import("@nestjs/testing");
    const builder = Test.createTestingModule({ imports: [module] });
    if (options.email)
      builder.overrideProvider(EmailPort).useValue(options.email);
    if (options.oauth)
      builder.overrideProvider(OAuthPort).useValue(options.oauth);
    if (options.vision)
      builder.overrideProvider(VisionProvider).useValue(options.vision);
    if (options.http)
      builder.overrideProvider(HttpTransport).useValue(options.http);
    app = (await builder.compile()).createNestApplication(adapter, {
      logger: false,
    });
  } else
    app = await NestFactory.create(module, adapter, {
      logger:
        options.environment.NODE_ENV === "test"
          ? false
          : ["log", "warn", "error"],
    });
  const config = app.get(ConfigurationService).values;
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.use(cookieParser(config.sessionSecret));
  app.enableCors({ origin: config.frontendUrl, credentials: true });
  if (config.trustProxy) server.set("trust proxy", 1);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalGuards(app.get(AccessGuard), app.get(RateGuard));
  app.useGlobalFilters(app.get(ApiExceptionFilter));
  SwaggerModule.setup("api/docs", app, documentation(app), {
    jsonDocumentUrl: "api/openapi.json",
  });
  app.enableShutdownHooks();
  return app;
}
