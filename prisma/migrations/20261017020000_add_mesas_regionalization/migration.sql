-- CreateEnum
CREATE TYPE "MesaRegionScope" AS ENUM ('NATIONAL', 'STATE', 'CITY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cityCode" TEXT,
ADD COLUMN     "cityName" TEXT,
ADD COLUMN     "countryCode" CHAR(2) DEFAULT 'BR',
ADD COLUMN     "locationUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "stateCode" CHAR(2);

-- AlterTable
ALTER TABLE "rankings" ADD COLUMN     "cityCode" TEXT,
ADD COLUMN     "cityName" TEXT,
ADD COLUMN     "countryCode" CHAR(2) DEFAULT 'BR',
ADD COLUMN     "regionScope" "MesaRegionScope" NOT NULL DEFAULT 'NATIONAL',
ADD COLUMN     "stateCode" CHAR(2);

-- CreateIndex
CREATE INDEX "rankings_type_status_regionScope_stateCode_cityCode_idx" ON "rankings"("type", "status", "regionScope", "stateCode", "cityCode");
