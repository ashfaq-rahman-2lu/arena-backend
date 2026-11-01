import { ConsoleLogger, Inject, Injectable, LogLevel } from "@nestjs/common";
import { ConfigurationService } from "../config/configuration.service";
import { RequestContextService } from "./request-context.service";

@Injectable()
export class ApplicationLoggerService extends ConsoleLogger {
  constructor(
    @Inject(ConfigurationService) config: ConfigurationService,
    private readonly requests: RequestContextService,
  ) {
    super("Arena", {
      json: config.values.environment === "production",
      logLevels:
        config.values.environment === "test" ? [] : ["log", "warn", "error"],
    });
  }

  protected override printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: "stdout" | "stderr",
    errorStack?: unknown,
  ): void {
    const correlation = this.requests.correlation();
    const contextual = messages.map((message: unknown): unknown =>
      correlation &&
      message &&
      typeof message === "object" &&
      !Array.isArray(message)
        ? { ...message, ...correlation }
        : message,
    );
    super.printMessages(
      contextual,
      context,
      logLevel,
      writeStreamType,
      errorStack,
    );
  }
}
