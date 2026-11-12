-- CreateTable
CREATE TABLE "duel_game_profiles" (
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "titleId" TEXT,
    "frameId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duel_game_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "duel_game_receipts" (
    "id" TEXT NOT NULL,
    "duelId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL DEFAULT 'duel-game-v1',
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" JSONB NOT NULL,

    CONSTRAINT "duel_game_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_xp_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "miniId" TEXT NOT NULL,
    "duelId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "localDay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duel_xp_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_xp_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDay" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duel_xp_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sourceDuelId" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duel_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_cosmetic_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duel_cosmetic_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "duel_game_receipts_duelId_key" ON "duel_game_receipts"("duelId");

-- CreateIndex
CREATE INDEX "duel_xp_grants_userId_localDay_idx" ON "duel_xp_grants"("userId", "localDay");

-- CreateIndex
CREATE UNIQUE INDEX "duel_xp_grants_userId_miniId_key" ON "duel_xp_grants"("userId", "miniId");

-- CreateIndex
CREATE UNIQUE INDEX "duel_xp_days_userId_localDay_key" ON "duel_xp_days"("userId", "localDay");

-- CreateIndex
CREATE UNIQUE INDEX "duel_achievements_userId_code_key" ON "duel_achievements"("userId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "duel_cosmetic_unlocks_userId_itemId_key" ON "duel_cosmetic_unlocks"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "duel_game_profiles" ADD CONSTRAINT "duel_game_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duel_game_receipts" ADD CONSTRAINT "duel_game_receipts_duelId_fkey" FOREIGN KEY ("duelId") REFERENCES "mini_duels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duel_xp_grants" ADD CONSTRAINT "duel_xp_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duel_xp_grants" ADD CONSTRAINT "duel_xp_grants_miniId_fkey" FOREIGN KEY ("miniId") REFERENCES "mini_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duel_xp_grants" ADD CONSTRAINT "duel_xp_grants_duelId_fkey" FOREIGN KEY ("duelId") REFERENCES "mini_duels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duel_xp_days" ADD CONSTRAINT "duel_xp_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duel_achievements" ADD CONSTRAINT "duel_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duel_cosmetic_unlocks" ADD CONSTRAINT "duel_cosmetic_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "rankings_type_status_registrationClosedAt_entryEndDate_createdA" RENAME TO "rankings_type_status_registrationClosedAt_entryEndDate_crea_idx";
