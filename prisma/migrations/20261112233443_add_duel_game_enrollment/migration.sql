-- CreateTable
CREATE TABLE "duel_game_enrollments" (
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "ruleVersion" TEXT NOT NULL DEFAULT 'duel-game-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duel_game_enrollments_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "duel_game_enrollments_endedAt_idx" ON "duel_game_enrollments"("endedAt");

-- AddForeignKey
ALTER TABLE "duel_game_enrollments" ADD CONSTRAINT "duel_game_enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
