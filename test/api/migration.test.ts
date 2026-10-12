import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
const membership =
  "prisma/migrations/20261012000000_round_membership/migration.sql";
function sql(url: string, source: string): string {
  return execFileSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", "-At"], {
    input: source,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
async function temporaryDatabase(
  run: (url: string) => Promise<void>,
): Promise<void> {
  const value = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!value || !new URL(value).pathname.endsWith("_test"))
    throw new Error("Migration tests require a dedicated _test URL");
  const admin = new URL(value);
  admin.search = "";
  admin.pathname = "/postgres";
  const name = `arena_migration_${process.pid}_${Date.now()}_test`;
  const target = new URL(admin);
  target.pathname = "/" + name;
  sql(admin.toString(), `CREATE DATABASE "${name}";`);
  try {
    await run(target.toString());
  } finally {
    sql(admin.toString(), `DROP DATABASE "${name}" WITH (FORCE);`);
  }
}
function previousMigrations(url: string): void {
  for (const folder of readdirSync("prisma/migrations")
    .filter((name: string): boolean => name.startsWith("20261011"))
    .sort())
    sql(url, readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"));
}
const validFixture = `INSERT INTO "User" (id,email,name) VALUES ('owner','migration@example.test','Owner');
INSERT INTO "Tournament" (id,"publicId","ownerId",name,game,format) VALUES ('a','AAAA2026','owner','A','EFOOTBALL','WORLD_CUP'),('b','BBBB2026','owner','B','EFOOTBALL','WORLD_CUP');
INSERT INTO "Entrant" (id,"tournamentId",name,"nameKey",aliases) VALUES ('entrant-a','a','Alpha','alpha',ARRAY[]::text[]),('entrant-b','b','Beta','beta',ARRAY[]::text[]);
INSERT INTO "Round" (id,"tournamentId",number) VALUES ('round-a','a',1);
INSERT INTO "Bye" (id,"roundId","entrantId") VALUES ('bye','round-a','entrant-a');`;
test("all committed migrations deploy to a fresh test database and backfill existing byes", async (): Promise<void> =>
  temporaryDatabase(async (url: string): Promise<void> => {
    previousMigrations(url);
    sql(url, validFixture);
    sql(url, readFileSync(membership, "utf8"));
    assert.equal(
      sql(url, 'SELECT "tournamentId" FROM "Bye" WHERE id=\'bye\';'),
      "a",
    );
    assert.equal(sql(url, 'SELECT count(*) FROM "Entrant";'), "2");
  }));
test("inconsistent existing membership aborts the migration without altering or deleting records", async (): Promise<void> =>
  temporaryDatabase(async (url: string): Promise<void> => {
    previousMigrations(url);
    sql(url, validFixture + 'UPDATE "Bye" SET "entrantId"=\'entrant-b\';');
    const result = spawnSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1"], {
      input: readFileSync(membership, "utf8"),
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cross-tournament bye membership/);
    assert.equal(
      sql(url, 'SELECT "entrantId" FROM "Bye" WHERE id=\'bye\';'),
      "entrant-b",
    );
    assert.equal(
      sql(
        url,
        "SELECT count(*) FROM information_schema.columns WHERE table_name='Bye' AND column_name='tournamentId';",
      ),
      "0",
    );
  }));
