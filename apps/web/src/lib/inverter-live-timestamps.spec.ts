import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Espelha a política de parse AUXSOL (sem timezone → UTC) usada em live-reading.view.
 * collectedAt e lastCommAt devem produzir o mesmo instante quando o fabricante
 * envia o mesmo wall-clock sem offset.
 */
function parseAuxsolLikeTimestamp(value: string): Date {
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(trimmed)
    && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed;
  return new Date(normalized);
}

describe('Horários collectedAt vs lastCommAt', () => {
  it('6) strings sem TZ alinhadas em UTC evitam deslocamento de 3h na UI', () => {
    const collectedAt = parseAuxsolLikeTimestamp('2026-11-08 16:34:41');
    const lastCommAt = parseAuxsolLikeTimestamp('2026-11-08 16:34:41');
    assert.equal(collectedAt.toISOString(), '2026-11-08T16:34:41.000Z');
    assert.equal(lastCommAt.toISOString(), collectedAt.toISOString());

    // Antes: lastComm bruto sem Z era interpretado como horário local pelo browser,
    // gerando +3h vs collectedAt ISO-UTC formatado em America/Sao_Paulo.
    const buggyLocal = new Date('2026-11-08 16:34:41');
    const utcForced = new Date('2026-11-08T16:34:41.000Z');
    // Em fuso BRT (UTC-3), a diferença entre parse local e UTC forçado é 3h.
    const deltaHours = Math.abs(buggyLocal.getTime() - utcForced.getTime()) / 3_600_000;
    assert.ok(deltaHours === 0 || deltaHours === 3);
  });
});
