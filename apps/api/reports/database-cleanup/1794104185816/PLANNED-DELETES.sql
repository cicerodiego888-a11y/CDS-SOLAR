-- PLANEJADO — NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA DO PO
-- Transação única; rollback integral em falha.
BEGIN;
-- Customer fictício candidato: SPRINT5 CERT TESTE EDITADO (cmuigi19j0001tyagat7gu92i)
-- Dependências: plants=2, inverters=2, equipment=5, readings=0, alerts=0, bindings=0, memberships=0, users=0, rateio=0
-- sem MonitoringReading
-- sem Alert
-- sem IntegrationBinding
-- sem EnergyRateio
DELETE FROM "Equipment" WHERE "plantId" IN (SELECT id FROM "Plant" WHERE "customerId" = 'cmuigi19j0001tyagat7gu92i');
DELETE FROM "Inverter" WHERE "plantId" IN (SELECT id FROM "Plant" WHERE "customerId" = 'cmuigi19j0001tyagat7gu92i');
-- sem UserMembership
DELETE FROM "Plant" WHERE "customerId" = 'cmuigi19j0001tyagat7gu92i';
-- sem User vinculado
DELETE FROM "Customer" WHERE id = 'cmuigi19j0001tyagat7gu92i';
-- Customer fictício candidato: SPRINT5 CERT SEM CONSUMER (cmuigi1b80002tyagumh96ecs)
-- Dependências: plants=1, inverters=0, equipment=0, readings=0, alerts=0, bindings=0, memberships=0, users=0, rateio=0
-- sem MonitoringReading
-- sem Alert
-- sem IntegrationBinding
-- sem EnergyRateio
-- sem Equipment
-- sem Inverter
-- sem UserMembership
DELETE FROM "Plant" WHERE "customerId" = 'cmuigi1b80002tyagumh96ecs';
-- sem User vinculado
DELETE FROM "Customer" WHERE id = 'cmuigi1b80002tyagumh96ecs';
-- Customer fictício candidato: SPRINT5 CERT OUTRO CONSUMER (cmuigi1bn0003tyagp4m522ja)
-- Dependências: plants=0, inverters=0, equipment=0, readings=0, alerts=0, bindings=0, memberships=0, users=0, rateio=0
-- sem MonitoringReading
-- sem Alert
-- sem IntegrationBinding
-- sem EnergyRateio
-- sem Equipment
-- sem Inverter
-- sem UserMembership
-- sem Plant
-- sem User vinculado
DELETE FROM "Customer" WHERE id = 'cmuigi1bn0003tyagp4m522ja';
-- Customer fictício candidato: SPRINT5 CERT VIA COMERCIAL (cmuigi2as000styag2oa5xo2p)
-- Dependências: plants=0, inverters=0, equipment=0, readings=0, alerts=0, bindings=0, memberships=0, users=0, rateio=0
-- sem MonitoringReading
-- sem Alert
-- sem IntegrationBinding
-- sem EnergyRateio
-- sem Equipment
-- sem Inverter
-- sem UserMembership
-- sem Plant
-- sem User vinculado
DELETE FROM "Customer" WHERE id = 'cmuigi2as000styag2oa5xo2p';
-- Validação pós-delete (deve retornar apenas Ulisses + José):
SELECT id, name FROM "Customer" ORDER BY name;
COMMIT;