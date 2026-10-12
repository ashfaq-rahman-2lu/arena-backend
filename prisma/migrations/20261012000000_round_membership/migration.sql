BEGIN;
-- Abort without deleting or repairing inconsistent records.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Match" m JOIN "Round" r ON r.id=m."knockoutRoundId" WHERE m."tournamentId"<>r."tournamentId") THEN
  RAISE EXCEPTION 'Cross-tournament knockout round membership exists; resolve records before retrying migration';
 END IF;
 IF EXISTS (SELECT 1 FROM "Bye" b JOIN "Round" r ON r.id=b."roundId" JOIN "Entrant" e ON e.id=b."entrantId" WHERE r."tournamentId"<>e."tournamentId") THEN
  RAISE EXCEPTION 'Cross-tournament bye membership exists; resolve records before retrying migration';
 END IF;
END $$;
ALTER TABLE "Bye" ADD COLUMN "tournamentId" TEXT;
UPDATE "Bye" b SET "tournamentId"=r."tournamentId" FROM "Round" r WHERE r.id=b."roundId";
ALTER TABLE "Bye" ALTER COLUMN "tournamentId" SET NOT NULL;
CREATE UNIQUE INDEX "Round_tournamentId_id_key" ON "Round"("tournamentId",id);
ALTER TABLE "Match" DROP CONSTRAINT "Match_knockoutRoundId_fkey";
ALTER TABLE "Match" ADD CONSTRAINT "round_same_tournament" FOREIGN KEY ("tournamentId","knockoutRoundId") REFERENCES "Round"("tournamentId",id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bye" DROP CONSTRAINT "Bye_roundId_fkey";
ALTER TABLE "Bye" DROP CONSTRAINT "Bye_entrantId_fkey";
ALTER TABLE "Bye" ADD CONSTRAINT "bye_round_same_tournament" FOREIGN KEY ("tournamentId","roundId") REFERENCES "Round"("tournamentId",id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bye" ADD CONSTRAINT "bye_entrant_same_tournament" FOREIGN KEY ("tournamentId","entrantId") REFERENCES "Entrant"("tournamentId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
