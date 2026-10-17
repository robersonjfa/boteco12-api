-- CreateEnum
CREATE TYPE "MesaInitializationStatus" AS ENUM ('WAITING_FOR_REGISTRATION_CLOSE', 'WAITING_FOR_REFERENCE_ROUND', 'WAITING_FOR_BASELINE_CAPTURE', 'READY');

-- AlterTable
ALTER TABLE "ranking_participants" ADD COLUMN     "scoreInitialCapturedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rankings" ADD COLUMN     "initializationStatus" "MesaInitializationStatus",
ADD COLUMN     "referenceRoundId" TEXT,
ADD COLUMN     "scoreInitialCapturedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "rankings_referenceRoundId_idx" ON "rankings"("referenceRoundId");

-- CreateIndex
CREATE INDEX "rankings_initializationStatus_referenceRoundId_idx" ON "rankings"("initializationStatus", "referenceRoundId");

-- AddForeignKey
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_referenceRoundId_fkey" FOREIGN KEY ("referenceRoundId") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

