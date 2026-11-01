import { DynamicModule, Global, Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import "reflect-metadata";

import { ApiExceptionFilter } from "./common/api-exception.filter";
import { ApplicationLoggerService } from "./common/application-logger.service";
import { FetchHttpAdapter, HttpTransport } from "./common/fetch-http.adapter";
import { RequestContextService } from "./common/request-context.service";
import { RequestLoggingService } from "./common/request-logging.service";
import { validateConfiguration } from "./config/configuration";
import { ConfigurationService } from "./config/configuration.service";
@Global()
@Module({})
export class InfrastructureModule {
  static register(environment: Record<string, unknown>): DynamicModule {
    const configuration = validateConfiguration(environment);
    return {
      module: InfrastructureModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            (): { arena: typeof configuration } => ({ arena: configuration }),
          ],
        }),
      ],
      providers: [
        ConfigurationService,
        RequestContextService,
        RequestLoggingService,
        ApplicationLoggerService,
        { provide: Logger, useExisting: ApplicationLoggerService },
        ApiExceptionFilter,
        { provide: HttpTransport, useClass: FetchHttpAdapter },
      ],
      exports: [
        ConfigurationService,
        RequestContextService,
        RequestLoggingService,
        Logger,
        ApiExceptionFilter,
        HttpTransport,
      ],
    };
  }
}
