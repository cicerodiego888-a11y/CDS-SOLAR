import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterObservationsByPlant,
  overlayOperationalHealth,
  pickObservationTimestamp,
  resolveInverterObservation,
  summarizePlantCommunication,
} from './monitoring-coherence.ts';
import { formatCoveragePercent, formatPercentOrNd } from './format.ts';

const now = new Date('2026-11-08T03:00:00.000Z');

const binding = {
  id: 'inv-1',
  hasBinding: true,
  bindingStatus: 'READY',
  externalId: 'ASN-10SL251016000352',
};

describe('Cenário A — leitura ao vivo válida sem persistência', () => {
  it('reconhece comunicação, observação e cobertura N/D sem inventar histórico', () => {
    const observation = resolveInverterObservation({
      ...binding,
      persistedLastReadingAt: null,
      live: {
        available: true,
        collectedAt: '2026-11-08T02:55:00.000Z',
        lastCommAt: '2026-11-08 02:50:00',
        powerKw: 3.2,
        energyTodayKwh: 12,
        communicationOk: true,
        persisted: false,
      },
    }, now);

    assert.equal(observation.source, 'live');
    assert.equal(observation.integrationState, 'ONLINE');
    assert.equal(observation.lastReadingAt, '2026-11-08T02:55:00.000Z');

    const overlay = overlayOperationalHealth(
      { health: 'NO_DATA', reason: 'NO_DATA', coveragePercent: 0, observedInverters: 0, invertersWithoutData: 1 },
      [observation],
      1,
    );

    assert.equal(overlay.communicationLabel, 'Online');
    assert.equal(overlay.observedInverters, 1);
    assert.equal(overlay.coveragePercent, null);
    assert.equal(formatCoveragePercent(overlay.coveragePercent), 'Não disponível');
    assert.equal(overlay.health, 'HEALTHY');
    assert.equal(overlay.historyIndependentOfLive, true);
  });
});

describe('Cenário B — potência zero é valor válido', () => {
  it('não interpreta 0 kW como ausência de leitura', () => {
    const observation = resolveInverterObservation({
      ...binding,
      live: {
        available: true,
        collectedAt: '2026-11-08T02:55:00.000Z',
        lastCommAt: null,
        powerKw: 0,
        energyTodayKwh: 69.32,
        communicationOk: true,
      },
    }, now);

    assert.equal(observation.powerIsValidZero, true);
    assert.equal(observation.powerKw, 0);
    assert.equal(observation.integrationState, 'ONLINE');
    assert.equal(observation.source, 'live');
  });
});

describe('Cenário C — ausência de leitura ao vivo', () => {
  it('não inventa observação e permanece aguardando dados quando sem histórico', () => {
    const observation = resolveInverterObservation({
      ...binding,
      persistedLastReadingAt: null,
      live: { available: false, collectedAt: null, lastCommAt: null, powerKw: null, energyTodayKwh: null, communicationOk: null },
    }, now);

    assert.equal(observation.source, 'none');
    assert.equal(observation.integrationState, 'CONFIGURED_AWAITING_DATA');

    const overlay = overlayOperationalHealth(
      { health: 'NO_DATA', reason: 'NO_DATA', coveragePercent: 0, observedInverters: 0 },
      [observation],
      1,
    );
    assert.equal(overlay.communicationLabel, 'Aguardando dados');
    assert.equal(overlay.observedInverters, 0);
  });
});

describe('Cenário D — histórico vazio não invalida live', () => {
  it('mantém live e cobertura sem percentual fictício', () => {
    const observation = resolveInverterObservation({
      ...binding,
      persistedLastReadingAt: null,
      live: {
        available: true,
        collectedAt: '2026-11-08T02:55:00.000Z',
        lastCommAt: null,
        powerKw: 1,
        energyTodayKwh: 2,
        communicationOk: true,
        persisted: false,
      },
    }, now);

    const overlay = overlayOperationalHealth(
      { health: 'NO_DATA', coveragePercent: 0, observedInverters: 0, availabilityPercent: null },
      [observation],
      1,
    );
    assert.equal(overlay.observedInverters, 1);
    assert.equal(overlay.availabilityPercent, null);
    assert.equal(formatPercentOrNd(overlay.availabilityPercent), 'Não disponível');
    assert.notEqual(overlay.health, 'NO_DATA');
  });
});

describe('Cenário E — collectedAt ≠ lastCommAt', () => {
  it('usa collectedAt para observação e preserva lastCommAt separado', () => {
    const stamps = pickObservationTimestamp({
      available: true,
      collectedAt: '2026-11-08T02:55:00.000Z',
      lastCommAt: '2026-11-07 23:00:00',
      powerKw: 0,
      energyTodayKwh: 1,
      communicationOk: true,
    });
    assert.equal(stamps.collectedAt, '2026-11-08T02:55:00.000Z');
    assert.equal(stamps.lastCommAt, '2026-11-07 23:00:00');

    const observation = resolveInverterObservation({
      ...binding,
      live: {
        available: true,
        collectedAt: stamps.collectedAt,
        lastCommAt: stamps.lastCommAt,
        powerKw: 0,
        energyTodayKwh: 1,
        communicationOk: true,
      },
    }, now);

    assert.equal(observation.observationTimestamp, stamps.collectedAt);
    assert.equal(observation.lastCommAt, stamps.lastCommAt);
    assert.notEqual(observation.observationTimestamp, observation.lastCommAt);
  });
});

describe('Cenário F — isolamento entre usinas', () => {
  it('não contabiliza leitura de outra usina', () => {
    const items = [
      { ...binding, id: 'a', plantId: 'plant-ulisses', live: { available: true, collectedAt: '2026-11-08T02:55:00.000Z', lastCommAt: null, powerKw: 1, energyTodayKwh: 1, communicationOk: true } },
      { ...binding, id: 'b', plantId: 'plant-jose', live: { available: true, collectedAt: '2026-11-08T02:55:00.000Z', lastCommAt: null, powerKw: 5, energyTodayKwh: 5, communicationOk: true } },
    ];
    const onlyUlisses = filterObservationsByPlant(items, 'plant-ulisses');
    assert.equal(onlyUlisses.length, 1);
    assert.equal(onlyUlisses[0].id, 'a');

    const observations = onlyUlisses.map((item) => resolveInverterObservation(item, now));
    const overlay = overlayOperationalHealth(null, observations, 1);
    assert.equal(overlay.observedInverters, 1);
  });
});

describe('Resumo de comunicação alinhado à tabela', () => {
  it('não mostra Aguardando dados quando a mesma leitura live é ONLINE', () => {
    const observation = resolveInverterObservation({
      ...binding,
      live: {
        available: true,
        collectedAt: '2026-11-08T02:55:00.000Z',
        lastCommAt: null,
        powerKw: 0,
        energyTodayKwh: 69.32,
        communicationOk: true,
      },
    }, now);
    const summary = summarizePlantCommunication([observation]);
    assert.equal(summary.label, 'Online');
  });
});
