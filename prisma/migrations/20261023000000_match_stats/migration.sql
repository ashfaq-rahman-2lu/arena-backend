ALTER TABLE "Tournament" ADD COLUMN "statsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Match" ADD COLUMN "stats" JSONB;
CREATE UNIQUE INDEX "Tournament_ownerId_id_key" ON "Tournament"("ownerId", "id");

CREATE TABLE "TournamentStatSlot" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  CONSTRAINT "TournamentStatSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentStatSlot_slot_check" CHECK ("slot" BETWEEN 1 AND 3),
  CONSTRAINT "TournamentStatSlot_ownerId_slot_key" UNIQUE ("ownerId", "slot"),
  CONSTRAINT "TournamentStatSlot_tournamentId_key" UNIQUE ("tournamentId"),
  CONSTRAINT "TournamentStatSlot_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TournamentStatSlot_ownerId_tournamentId_fkey" FOREIGN KEY ("ownerId", "tournamentId") REFERENCES "Tournament"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TournamentStatSlot_ownerId_idx" ON "TournamentStatSlot"("ownerId");
CREATE UNIQUE INDEX "TournamentStatSlot_ownerId_tournamentId_key" ON "TournamentStatSlot"("ownerId", "tournamentId");
