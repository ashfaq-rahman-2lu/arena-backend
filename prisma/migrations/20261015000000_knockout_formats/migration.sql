BEGIN;
ALTER TABLE "Tournament" DROP CONSTRAINT "valid_format";
ALTER TABLE "Tournament" ADD CONSTRAINT "valid_format" CHECK ("format" IN ('LEAGUE','WORLD_CUP','KNOCKOUT'));
ALTER TABLE "Tournament" ADD COLUMN "knockoutLegs" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "knockoutFinalLegs" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Tournament" ADD CONSTRAINT "valid_knockout_legs" CHECK ("knockoutLegs" IN (1,2) AND "knockoutFinalLegs" IN (1,2) AND "knockoutFinalLegs" <= "knockoutLegs");
ALTER TABLE "Round" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Round" ADD CONSTRAINT "valid_pairing_method" CHECK ("method" IN ('MANUAL','RANDOM','FIXED'));
ALTER TABLE "Bye" ADD COLUMN "slot" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "KnockoutTie" (
 "id" TEXT PRIMARY KEY, "tournamentId" TEXT NOT NULL, "roundId" TEXT NOT NULL, "slot" INTEGER NOT NULL CHECK ("slot">=0),
 "homeId" TEXT NOT NULL, "awayId" TEXT NOT NULL, "legs" INTEGER NOT NULL CHECK ("legs" IN (1,2)),
 "homeTiebreak" INTEGER, "awayTiebreak" INTEGER, "winnerId" TEXT,
 CONSTRAINT "tie_distinct_opponents" CHECK ("homeId" <> "awayId"),
 CONSTRAINT "tie_valid_winner" CHECK ("winnerId" IS NULL OR "winnerId" IN ("homeId","awayId")),
 CONSTRAINT "tie_tiebreak_scores" CHECK (("homeTiebreak" IS NULL) = ("awayTiebreak" IS NULL) AND "homeTiebreak">=0 AND "awayTiebreak">=0),
 FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE,
 FOREIGN KEY ("tournamentId","roundId") REFERENCES "Round"("tournamentId","id") ON DELETE CASCADE,
 FOREIGN KEY ("tournamentId","homeId") REFERENCES "Entrant"("tournamentId","id"),
 FOREIGN KEY ("tournamentId","awayId") REFERENCES "Entrant"("tournamentId","id")
);
CREATE UNIQUE INDEX "KnockoutTie_tournamentId_id_key" ON "KnockoutTie"("tournamentId","id");
CREATE UNIQUE INDEX "KnockoutTie_roundId_slot_key" ON "KnockoutTie"("roundId","slot");
ALTER TABLE "Match" ADD COLUMN "knockoutTieId" TEXT;
INSERT INTO "KnockoutTie" (id,"tournamentId","roundId",slot,"homeId","awayId",legs,"homeTiebreak","awayTiebreak","winnerId")
 SELECT 'legacy-' || id,"tournamentId","knockoutRoundId",row_number() OVER (PARTITION BY "knockoutRoundId" ORDER BY "pairingKey",id)-1,"homeId","awayId",1,"homeTiebreak","awayTiebreak","winnerId" FROM "Match" WHERE stage='KNOCKOUT';
UPDATE "Match" SET "knockoutTieId"='legacy-' || id WHERE stage='KNOCKOUT';
UPDATE "Bye" b SET slot=x.position FROM (
 SELECT b.id,(SELECT count(*) FROM "KnockoutTie" t WHERE t."roundId"=b."roundId") + row_number() OVER (PARTITION BY b."roundId" ORDER BY b.id)-1 AS position FROM "Bye" b
) x WHERE x.id=b.id;
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_knockoutTieId_fkey" FOREIGN KEY ("tournamentId","knockoutTieId") REFERENCES "KnockoutTie"("tournamentId",id) ON DELETE CASCADE;
CREATE UNIQUE INDEX "Match_knockoutTieId_leg_key" ON "Match"("knockoutTieId",leg);
COMMIT;
