CREATE TYPE "OAuthAction" AS ENUM ('LOGIN', 'LINK', 'EMAIL_CHANGE');
CREATE TABLE "OAuthAttempt" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "action" "OAuthAction" NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "proposedEmail" TEXT,
    "returnTo" TEXT NOT NULL DEFAULT '/dashboard',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OAuthAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OAuthAttempt_stateHash_key" ON "OAuthAttempt"("stateHash");
CREATE INDEX "OAuthAttempt_expiresAt_idx" ON "OAuthAttempt"("expiresAt");
ALTER TABLE "OAuthAttempt" ADD CONSTRAINT "OAuthAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthAttempt" ADD CONSTRAINT "OAuthAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
