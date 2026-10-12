import { writeFileSync } from "node:fs";
import { createApp } from "./app";
import { offlineEnvironment } from "./config/configuration";
import { documentation } from "./swagger";
async function main(): Promise<void> {
  const app = await createApp({ environment: offlineEnvironment });
  try {
    writeFileSync(
      "openapi.json",
      JSON.stringify(documentation(app), null, 2) + "\n",
    );
  } finally {
    await app.close();
  }
}
main().catch((error: unknown): void => {
  process.stderr.write(
    error instanceof Error ? error.message : "OpenAPI generation failed",
  );
  process.exitCode = 1;
});
