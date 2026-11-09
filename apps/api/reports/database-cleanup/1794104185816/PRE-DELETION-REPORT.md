# B7-DATABASE-CLEANUP-01 — Relatório pré-exclusão

**Status:** AGUARDANDO AUTORIZAÇÃO EXPLÍCITA DO PRODUCT OWNER  
**Exclusões executadas:** NÃO  
**Alterações AUXSOL:** Nenhuma  
**Segredos:** Não expostos

## 1. Base local identificada

| Item | Valor |
|------|-------|
| Fonte | `apps/api/.env` → `DATABASE_URL` |
| Host | `localhost:5432` |
| Database | `b7_solar` |
| User | `b7` |
| Container Docker | `b7-solar-postgres` (postgres:17-alpine) |
| Reset/seed/migração destrutiva | **Não executados** |

## 2. Clientes a preservar

### Ulisses Lima — CONFIRMADO
| Campo | Valor |
|------|-------|
| ID | `cmucom31o0005tymcu7cgt9d3` |
| Documento | `00893696455` |
| Plant | `cmucots7g0007tymccjpscinm` (10 kWp, Equatorial) |
| Inversor | `cmw76di320001tyys55mvm5ex` · SN `ASN-10SL251016000352` |
| Binding | `cmw76di400003tyys4dhcrfnh` · READY · AUXSOL |
| Gateway | `A012510191909021` (vinculado) |

### José — CONFIRMADO no cadastro local (atenção ao nome)
| Campo | Valor |
|------|-------|
| ID | `cmu7lkkmu0000tyus5j0u824g` |
| Nome cadastrado | **José Bezerra Sobrinho** (não “José Rodrigues”) |
| Documento | `06105181515` |
| Plant | `cmube71va0001tyi0i6d0f8ll` (20 kWp, Equatorial) |
| Inversor | SN `ASN-10SL2508230101` · ASN-10SL |
| Gateway | `A012509010791620` |

> **Decisão necessária do PO:** confirmar que “José Rodrigues” do enunciado corresponde a **José Bezerra Sobrinho** (`cmu7lkkmu0000tyus5j0u824g`). É o único José na base.

## 3. Inventário completo (6 customers)

| ID | Nome | Classificação | Evidência fictícia |
|----|------|---------------|--------------------|
| `cmucom31o0005tymcu7cgt9d3` | Ulisses Lima | **PRESERVE** | Cliente real |
| `cmu7lkkmu0000tyus5j0u824g` | José Bezerra Sobrinho | **PRESERVE** | Cliente real |
| `cmuigi19j0001tyagat7gu92i` | SPRINT5 CERT TESTE EDITADO | **CANDIDATO** | Prefixo SPRINT5 CERT · email `@b7.invalid` · doc `S5-*` · SN `SN-S5-*` / model `ASN-TEST-S5` |
| `cmuigi1b80002tyagumh96ecs` | SPRINT5 CERT SEM CONSUMER | **CANDIDATO** | Prefixo SPRINT5 CERT · `@b7.invalid` · doc `S5B-*` · usina legada de teste |
| `cmuigi1bn0003tyagp4m522ja` | SPRINT5 CERT OUTRO CONSUMER | **CANDIDATO** | Prefixo SPRINT5 CERT · `@b7.invalid` · sem plantas |
| `cmuigi2as000styag2oa5xo2p` | SPRINT5 CERT VIA COMERCIAL | **CANDIDATO** | Prefixo SPRINT5 CERT · `@b7.invalid` · sem plantas |

## 4. Dependências dos candidatos (lista proposta)

### A) `cmuigi19j0001tyagat7gu92i` — SPRINT5 CERT TESTE EDITADO
- Plants: 2 (`cmuigi1kb000btyag05i5kfdi`, `cmuigi1sm000ftyagt2ysvs0s`)
- Inverters: 2 (`SN-S5-1790431186647`)
- Equipment: 5 (GW/DL/MEDIDOR/COMUNICACAO/OUTRO de teste)
- Readings/Alerts/Bindings/Users/Memberships: 0

### B) `cmuigi1b80002tyagumh96ecs` — SPRINT5 CERT SEM CONSUMER
- Plants: 1 (`cmuigi1iu0009tyagzdzvz1q2` — USINA LEGADA)
- Demais dependências operacionais: 0

### C) `cmuigi1bn0003tyagp4m522ja` — SPRINT5 CERT OUTRO CONSUMER
- Sem plant/inversor/equipamento

### D) `cmuigi2as000styag2oa5xo2p` — SPRINT5 CERT VIA COMERCIAL
- Sem plant/inversor/equipamento

## 5. Recursos compartilhados (FORA da exclusão automática nesta fase)

| Recurso | Qtd | Observação |
|---------|-----|------------|
| Users | 1 | `admin@b7solar.local` · `customerId=null` — **não excluir** |
| Manufacturers | 7 | Catálogo compartilhado — **não excluir** |
| Distributors | 1 | Único registro: `SPRINT5 CERT DISTRIBUIDORA` (`cmuigi18h0000tyag1xrjnyei`). Ulisses/José usam `Plant.distributor` texto legado (“Equatorial”), sem vínculo formal a esta tabela. |
| Consumers SPRINT5 | 3 | Titulares `@b7.invalid` / docs de teste — **órfãos potenciais**; limpeza só com aprovação extra |
| ConsumerUnits SPRINT5 | 3 | `910000111002/003/004` na distribuidora SPRINT5 — **não apagar automaticamente** |

Recomendação: fase 1 aprova só Customers SPRINT5 (+ plants/inverters/equipment). Consumers/UCs/Distributor em sprint/limpeza posterior.

## 6. Backup verificável

| Item | Valor |
|------|-------|
| Arquivo | `apps/api/reports/database-cleanup/1794104185816/b7_solar-backup-1794104185816.dump` |
| Formato | `pg_dump -Fc` via Docker `b7-solar-postgres` |
| Bytes | 60138 |
| SHA256 | `6e4bd7edd3fe8961e1700b8ec63a3ae3013438535f3fa5f0687d5730fa778d60` |
| Cópia estável | `apps/api/reports/database-cleanup/b7_solar-predelete.dump` (SHA256 `714CC2AF9BBF42E8AE104287A342BFECF952E5E7DE60B701D8929F5C880B7229`) |
| Verificação | `docker exec b7-solar-postgres pg_restore --list /tmp/b7_solar_cleanup_*.dump` |

## 7. Plano transacional (após autorização)

1. Confirmar backup OK + SHA256.  
2. PO autorizar a **lista exata** de `customerIds` abaixo.  
3. `BEGIN` → deletes ordenados apenas dos IDs aprovados (ver `PLANNED-DELETES.sql`).  
4. Validar: apenas Ulisses + José em `Customer`.  
5. Validar SN/binding Ulisses intactos.  
6. Smoke liveReading Ulisses (`AUXSOL_PERSIST_READINGS=false`).  
7. `COMMIT` — falha ⇒ `ROLLBACK` integral.

**Proibido:** TRUNCATE, reset, seed, DROP DATABASE, CASCADE indiscriminado, DELETE sem WHERE.

## 8. SQL planejado

Arquivo: `PLANNED-DELETES.sql`  
**Não executar sem autorização.**

## 9. Lista exata proposta para autorização do PO

Autorizar exclusão **somente** destes 4 IDs?

1. `cmuigi19j0001tyagat7gu92i` — SPRINT5 CERT TESTE EDITADO  
2. `cmuigi1b80002tyagumh96ecs` — SPRINT5 CERT SEM CONSUMER  
3. `cmuigi1bn0003tyagp4m522ja` — SPRINT5 CERT OUTRO CONSUMER  
4. `cmuigi2as000styag2oa5xo2p` — SPRINT5 CERT VIA COMERCIAL  

**Preservar obrigatoriamente:**
- `cmucom31o0005tymcu7cgt9d3` — Ulisses Lima  
- `cmu7lkkmu0000tyus5j0u824g` — José Bezerra Sobrinho  

**Confirmações pedidas ao PO:**
1. José Bezerra Sobrinho = José do enunciado?  
2. Aprovar a lista dos 4 SPRINT5 acima?  
3. Orphan Consumers/UCs SPRINT5: manter (recomendado nesta fase) ou limpar em sprint separada?

---

### Gate

```
status: WAITING_PO_APPROVAL
deletionsExecuted: false
```

Responda com a lista aprovada (IDs) para liberar a fase de execução.
