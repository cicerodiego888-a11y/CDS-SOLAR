import {
  AUXSOL_DISCOVERY_TARGET,
  AUXSOL_DISCOVERY_TARGET_ULISSES,
  buildAuxsolBindingExternalMeta,
  buildDiscoveryTargetReport,
  classifyAuxsolDiscovery,
  extractAuxsolListItems,
  findTargetInverter,
  normalizeAuxsolRealtimePreview,
  resolveAuxsolBindingExternalId,
  summarizeAuxsolInverters,
  summarizeAuxsolPlantPage,
  summarizeAuxsolRealtime,
} from './auxsol.discovery';

const PLANT_LIST_PAYLOAD = {
  code: 'AWX-0000',
  msg: null,
  data: {
    current: 1,
    size: 10,
    pages: 1,
    total: 1,
    records: [
      {
        plantId: 'plant-1',
        plantName: 'Usina Teste',
        owner: 'owner-1',
        capacity: 10,
        status: 1,
        address: 'Cidade',
      },
    ],
  },
};

const INVERTER_LIST_PAYLOAD = {
  code: 'AWX-0000',
  msg: null,
  data: [
    {
      id: 'inv-1',
      sn: AUXSOL_DISCOVERY_TARGET.sn,
      model: AUXSOL_DISCOVERY_TARGET.model,
      ratedPower: 10,
      collectorSn: AUXSOL_DISCOVERY_TARGET.gateway,
    },
  ],
};

describe('AUXSOL discovery (read-only, sem HTTP real)', () => {
  it('resume lista de plantas sem inventar campos', () => {
    const page = summarizeAuxsolPlantPage(PLANT_LIST_PAYLOAD, 10);
    expect(page.auxsolCode).toBe('AWX-0000');
    expect(page.count).toBe(1);
    expect(page.plants[0]).toEqual({
      plantId: 'plant-1',
      plantName: 'Usina Teste',
      owner: 'owner-1',
      capacity: 10,
      status: 1,
      address: 'Cidade',
    });
    expect(extractAuxsolListItems(PLANT_LIST_PAYLOAD.data)).toHaveLength(1);
  });

  it('resume lista de inversores por planta', () => {
    const list = summarizeAuxsolInverters(INVERTER_LIST_PAYLOAD, 'plant-1');
    expect(list.count).toBe(1);
    expect(list.inverters[0]).toMatchObject({
      inverterId: 'inv-1',
      sn: AUXSOL_DISCOVERY_TARGET.sn,
      model: AUXSOL_DISCOVERY_TARGET.model,
      ratedPower: 10,
      gateway: AUXSOL_DISCOVERY_TARGET.gateway,
    });
  });

  it('localiza o SN alvo exatamente como retornado', () => {
    const plants = [{
      plant: summarizeAuxsolPlantPage(PLANT_LIST_PAYLOAD, 10).plants[0],
      inverters: summarizeAuxsolInverters(INVERTER_LIST_PAYLOAD, 'plant-1').inverters,
    }];
    const match = findTargetInverter(plants);
    expect(match.found).toBe(true);
    if (match.found) {
      expect(match.sn).toBe(AUXSOL_DISCOVERY_TARGET.sn);
      expect(match.plantId).toBe('plant-1');
      expect(match.inverterId).toBe('inv-1');
    }
  });

  it('marca SN não encontrado e lista SNs observados', () => {
    const plants = [{
      plant: { plantId: 'plant-1', plantName: 'Usina', owner: null, capacity: null, status: null, address: null },
      inverters: [{
        inverterId: 'inv-x',
        sn: 'OTHER-SN-001',
        model: 'ASN-05SL',
        ratedPower: 5,
        gateway: null,
        identifiers: { sn: 'OTHER-SN-001' },
      }],
    }];
    const match = findTargetInverter(plants);
    expect(match.found).toBe(false);
    if (!match.found) {
      expect(match.observed).toEqual([{ sn: 'OTHER-SN-001', model: 'ASN-05SL' }]);
    }
  });

  it('localiza Ulisses por SN sem usar gateway como inversor', () => {
    const plants = [{
      plant: { plantId: 'plant-u', plantName: 'Ulisses', owner: null, capacity: null, status: null, address: null },
      inverters: [{
        inverterId: 'inv-u',
        sn: AUXSOL_DISCOVERY_TARGET_ULISSES.sn,
        model: 'ASN-10SL',
        ratedPower: 10,
        gateway: AUXSOL_DISCOVERY_TARGET_ULISSES.gateway,
        identifiers: { sn: AUXSOL_DISCOVERY_TARGET_ULISSES.sn, collectorSn: AUXSOL_DISCOVERY_TARGET_ULISSES.gateway },
      }],
    }];
    const match = findTargetInverter(plants, AUXSOL_DISCOVERY_TARGET_ULISSES.sn);
    expect(match.found).toBe(true);
    if (match.found) {
      expect(match.inverterId).toBe('inv-u');
      expect(match.gateway).toBe(AUXSOL_DISCOVERY_TARGET_ULISSES.gateway);
      expect(match.sn).not.toBe(AUXSOL_DISCOVERY_TARGET_ULISSES.gateway);
    }
    const report = buildDiscoveryTargetReport({
      label: 'Ulisses',
      match,
      b7: { model: 'ASL-10SL', inverterId: 'b7-i', manufacturer: 'AUXSOL' },
      b7ModelHint: 'ASL-10SL',
    });
    expect(report.targetFound).toBe(true);
    expect(report.bindingCandidate).toBe(true);
    expect(report.modelDivergence).toEqual({ b7Model: 'ASL-10SL', auxsolModel: 'ASN-10SL' });
  });

  it('monta externalMeta/externalId só com IDs oficiais', () => {
    expect(resolveAuxsolBindingExternalId({ inverterId: 'inv-1' })).toBe('inv-1');
    expect(resolveAuxsolBindingExternalId({ inverterId: null })).toBeNull();
    expect(buildAuxsolBindingExternalMeta({
      plantId: 'p1',
      inverterId: 'inv-1',
      serialNumber: AUXSOL_DISCOVERY_TARGET.sn,
      model: 'ASN-10SL',
      gatewayId: AUXSOL_DISCOVERY_TARGET.gateway,
    })).toEqual({
      provider: 'AUXSOL',
      resourceType: 'INVERTER',
      plantId: 'p1',
      inverterId: 'inv-1',
      serialNumber: AUXSOL_DISCOVERY_TARGET.sn,
      model: 'ASN-10SL',
      gatewayId: AUXSOL_DISCOVERY_TARGET.gateway,
    });
    expect(buildAuxsolBindingExternalMeta({ inverterId: null, serialNumber: null })).toBeNull();
  });

  it('realtime com data=null não é telemetria real', () => {
    const realtime = summarizeAuxsolRealtime({ code: 'AWX-0000', msg: null, data: null });
    expect(realtime.dataKind).toBe('null');
    expect(realtime.dataPresent).toBe(false);
    expect(normalizeAuxsolRealtimePreview({ code: 'AWX-0000', data: null }).confirmedFields).toEqual([]);
    expect(classifyAuxsolDiscovery({
      plantCount: 1,
      targetFound: true,
      realtimeQueried: true,
      dataPresent: realtime.dataPresent,
    })).toBe('C');
  });

  it('realtime preenchido classifica telemetria real', () => {
    const realtime = summarizeAuxsolRealtime({
      code: 'AWX-0000',
      msg: null,
      data: { sn: AUXSOL_DISCOVERY_TARGET.sn, dt: '2026-09-18 12:00:00', energyData: { power: 1.2, y: 3, ym: 40, yt: 500 } },
    });
    expect(realtime.dataKind).toBe('object');
    expect(realtime.dataPresent).toBe(true);
    expect(realtime.dataKeys).toEqual(expect.arrayContaining(['sn', 'dt', 'energyData']));
    const preview = normalizeAuxsolRealtimePreview({
      code: 'AWX-0000',
      data: { sn: AUXSOL_DISCOVERY_TARGET.sn, dt: '2026-09-18 12:00:00', energyData: { power: 1.2, y: 3, ym: 40, yt: 500 } },
    });
    expect(preview.confirmedFields).toEqual(expect.arrayContaining([
      'sn', 'dt', 'energyData.power', 'energyData.y', 'energyData.ym', 'energyData.yt',
    ]));
    expect(preview.units.power).toContain('kW');
    expect(classifyAuxsolDiscovery({
      plantCount: 1,
      targetFound: true,
      realtimeQueried: true,
      dataPresent: realtime.dataPresent,
    })).toBe('D');
  });

  it('classifica planta ausente e inversor ausente', () => {
    expect(classifyAuxsolDiscovery({
      plantCount: 0,
      targetFound: false,
      realtimeQueried: false,
      dataPresent: false,
    })).toBe('A');
    expect(classifyAuxsolDiscovery({
      plantCount: 2,
      targetFound: false,
      realtimeQueried: false,
      dataPresent: false,
    })).toBe('B');
  });
});
