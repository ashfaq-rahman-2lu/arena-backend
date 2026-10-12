import { DynamicModule, Global, Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import "reflect-metadata";

import { ApiExceptionFilter } from "./common/api-exception.filter";
import { FetchHttpAdapter, HttpTransport } from "./common/fetch-http.adapter";
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
        Logger,
        ApiExceptionFilter,
        { provide: HttpTransport, useClass: FetchHttpAdapter },
      ],
      exports: [
        ConfigurationService,
        Logger,
        ApiExceptionFilter,
        HttpTransport,
      ],
    };
  }
}
