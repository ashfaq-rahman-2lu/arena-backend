import { ConsoleLogger, Inject, Injectable } from "@nestjs/common";
import { ConfigurationService } from "../config/configuration.service";

@Injectable()
export class ApplicationLoggerService extends ConsoleLogger {
  constructor(@Inject(ConfigurationService) config: ConfigurationService) {
    super("Arena", {
      json: config.values.environment === "production",
      logLevels:
        config.values.environment === "test" ? [] : ["log", "warn", "error"],
    });
  }
}
