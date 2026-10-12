import { Logger } from "@nestjs/common";
import "dotenv/config";
import { createApp } from "./app";
import { ConfigurationService } from "./config/configuration.service";
async function main(): Promise<void> {
  const app = await createApp({ environment: process.env });
  const config = app.get(ConfigurationService).values;
  await app.listen(config.port, config.host);
  app.get(Logger).log(`Arena API listening on ${config.host}:${config.port}`);
}
main().catch((error: unknown): void => {
  process.stderr.write(
    error instanceof Error ? error.message : "Startup failed",
  );
  process.exitCode = 1;
});
