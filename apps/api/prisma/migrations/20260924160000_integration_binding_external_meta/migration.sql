-- Sprint 3: metadados externos genéricos no IntegrationBinding.
-- Permite IDs auxiliares do fabricante (plant/device/gateway) sem colunas específicas.
-- Nenhum dado existente é alterado ou apagado.

ALTER TABLE "IntegrationBinding" ADD COLUMN "externalMeta" JSONB;
