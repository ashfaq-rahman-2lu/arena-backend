CREATE TABLE "TournamentFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentFollow_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AuthToken" ADD COLUMN "value" TEXT;
CREATE UNIQUE INDEX "TournamentFollow_userId_tournamentId_key" ON "TournamentFollow"("userId", "tournamentId");
CREATE INDEX "TournamentFollow_userId_createdAt_tournamentId_idx" ON "TournamentFollow"("userId", "createdAt", "tournamentId");
ALTER TABLE "TournamentFollow" ADD CONSTRAINT "TournamentFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentFollow" ADD CONSTRAINT "TournamentFollow_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
