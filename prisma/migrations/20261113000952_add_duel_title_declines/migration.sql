-- CreateTable
CREATE TABLE "duel_declines" (
    "id" TEXT NOT NULL,
    "duelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duel_declines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duel_declines_userId_createdAt_idx" ON "duel_declines"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "duel_declines_duelId_userId_key" ON "duel_declines"("duelId", "userId");

-- AddForeignKey
ALTER TABLE "duel_declines" ADD CONSTRAINT "duel_declines_duelId_fkey" FOREIGN KEY ("duelId") REFERENCES "mini_duels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duel_declines" ADD CONSTRAINT "duel_declines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
