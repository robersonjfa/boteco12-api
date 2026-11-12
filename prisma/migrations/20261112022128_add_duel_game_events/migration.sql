-- CreateTable
CREATE TABLE "duel_game_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "userId" TEXT,
    "duelId" TEXT,
    "miniId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duel_game_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "duel_game_events_dedupeKey_key" ON "duel_game_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "duel_game_events_name_createdAt_idx" ON "duel_game_events"("name", "createdAt");

-- CreateIndex
CREATE INDEX "duel_game_events_userId_createdAt_idx" ON "duel_game_events"("userId", "createdAt");
