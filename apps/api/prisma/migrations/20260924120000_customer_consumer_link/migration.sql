-- Vínculo opcional 1:1 Customer → Consumer.
-- consumerId permanece nulo para clientes já existentes.
-- Nenhum dado é apagado e nenhuma coluna existente é alterada.

ALTER TABLE "Customer" ADD COLUMN "consumerId" TEXT;

CREATE UNIQUE INDEX "Customer_consumerId_key" ON "Customer"("consumerId");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
