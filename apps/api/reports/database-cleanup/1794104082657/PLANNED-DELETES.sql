-- PLANEJADO — NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA DO PO
-- Transação única; rollback integral em falha.
BEGIN;
-- Validação pós-delete (deve retornar apenas Ulisses + José):
SELECT id, name FROM "Customer" ORDER BY name;
COMMIT;