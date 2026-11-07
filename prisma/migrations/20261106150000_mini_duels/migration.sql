-- CreateTable
CREATE TABLE "mini_rounds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "closeAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mini_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mini_matches" (
    "id" TEXT NOT NULL,
    "miniId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "matchTime" TIMESTAMP(3) NOT NULL,
    "result" TEXT,

    CONSTRAINT "mini_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mini_predictions" (
    "id" TEXT NOT NULL,
    "miniId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prediction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mini_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mini_duels" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "miniId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "recipientId" TEXT,
    "opponentId" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "winnerId" TEXT,
    "settlement" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "mini_duels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mini_rounds_status_closeAt_idx" ON "mini_rounds"("status", "closeAt");

-- CreateIndex
CREATE UNIQUE INDEX "mini_matches_miniId_position_key" ON "mini_matches"("miniId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "mini_predictions_miniId_userId_key" ON "mini_predictions"("miniId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "mini_duels_requestKey_key" ON "mini_duels"("requestKey");

-- CreateIndex
CREATE INDEX "mini_duels_status_miniId_idx" ON "mini_duels"("status", "miniId");

-- CreateIndex
CREATE INDEX "mini_duels_creatorId_createdAt_idx" ON "mini_duels"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "mini_duels_recipientId_createdAt_idx" ON "mini_duels"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "mini_duels_opponentId_createdAt_idx" ON "mini_duels"("opponentId", "createdAt");

-- AddForeignKey
ALTER TABLE "mini_matches" ADD CONSTRAINT "mini_matches_miniId_fkey" FOREIGN KEY ("miniId") REFERENCES "mini_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_predictions" ADD CONSTRAINT "mini_predictions_miniId_fkey" FOREIGN KEY ("miniId") REFERENCES "mini_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_predictions" ADD CONSTRAINT "mini_predictions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_duels" ADD CONSTRAINT "mini_duels_miniId_fkey" FOREIGN KEY ("miniId") REFERENCES "mini_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_duels" ADD CONSTRAINT "mini_duels_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_duels" ADD CONSTRAINT "mini_duels_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_duels" ADD CONSTRAINT "mini_duels_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_duels" ADD CONSTRAINT "mini_duels_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
