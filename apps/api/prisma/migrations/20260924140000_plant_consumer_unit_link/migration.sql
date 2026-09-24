-- Sprint 2: vínculo Plant → ConsumerUnit e Conta Contrato na UC.
-- Campos legados Plant.distributor e Plant.consumerUnit são preservados.
-- Nenhum dado é apagado; nenhuma coluna existente é removida ou tornada obrigatória.

ALTER TABLE "ConsumerUnit" ADD COLUMN "contractAccount" TEXT;

ALTER TABLE "Plant" ADD COLUMN "consumerUnitId" TEXT;

CREATE INDEX "Plant_consumerUnitId_idx" ON "Plant"("consumerUnitId");

ALTER TABLE "Plant" ADD CONSTRAINT "Plant_consumerUnitId_fkey" FOREIGN KEY ("consumerUnitId") REFERENCES "ConsumerUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
