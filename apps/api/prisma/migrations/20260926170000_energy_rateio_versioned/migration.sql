-- Sprint 10: Rateio versionado (composição Plant → UCs). Não destrutivo.
-- Não migra Plant.consumerUnit legacy. Não altera José/Ulisses.

CREATE TYPE "EnergyRateioVersionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "EnergyRateioVersion" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "status" "EnergyRateioVersionStatus" NOT NULL DEFAULT 'ACTIVE',
    "modality" TEXT,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyRateioVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnergyRateioLine" (
    "id" TEXT NOT NULL,
    "rateioVersionId" TEXT NOT NULL,
    "consumerUnitId" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "percentage" DECIMAL(7,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnergyRateioLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnergyRateioVersion_plantId_versionNumber_key" ON "EnergyRateioVersion"("plantId", "versionNumber");
CREATE INDEX "EnergyRateioVersion_plantId_status_idx" ON "EnergyRateioVersion"("plantId", "status");
CREATE INDEX "EnergyRateioVersion_plantId_validFrom_idx" ON "EnergyRateioVersion"("plantId", "validFrom");
CREATE INDEX "EnergyRateioVersion_validFrom_validTo_idx" ON "EnergyRateioVersion"("validFrom", "validTo");

CREATE UNIQUE INDEX "EnergyRateioLine_rateioVersionId_consumerUnitId_key" ON "EnergyRateioLine"("rateioVersionId", "consumerUnitId");
CREATE INDEX "EnergyRateioLine_consumerUnitId_idx" ON "EnergyRateioLine"("consumerUnitId");
CREATE INDEX "EnergyRateioLine_consumerId_idx" ON "EnergyRateioLine"("consumerId");
CREATE INDEX "EnergyRateioLine_rateioVersionId_idx" ON "EnergyRateioLine"("rateioVersionId");

ALTER TABLE "EnergyRateioVersion" ADD CONSTRAINT "EnergyRateioVersion_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnergyRateioLine" ADD CONSTRAINT "EnergyRateioLine_rateioVersionId_fkey" FOREIGN KEY ("rateioVersionId") REFERENCES "EnergyRateioVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnergyRateioLine" ADD CONSTRAINT "EnergyRateioLine_consumerUnitId_fkey" FOREIGN KEY ("consumerUnitId") REFERENCES "ConsumerUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnergyRateioLine" ADD CONSTRAINT "EnergyRateioLine_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
