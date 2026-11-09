import {
  isAuxsolInverterPersistAllowed,
  isAuxsolPersistReadingsEnabled,
  isReadingPersistAllowed,
  parseAuxsolPersistInverterIds,
} from './auxsol-persist-scope';

const ULISSES = 'cmw76di320001tyys55mvm5ex';
const JOSE = 'other-inverter-id';

describe('auxsol-persist-scope', () => {
  const prevPersist = process.env.AUXSOL_PERSIST_READINGS;
  const prevIds = process.env.AUXSOL_PERSIST_INVERTER_IDS;

  afterEach(() => {
    if (prevPersist === undefined) delete process.env.AUXSOL_PERSIST_READINGS;
    else process.env.AUXSOL_PERSIST_READINGS = prevPersist;
    if (prevIds === undefined) delete process.env.AUXSOL_PERSIST_INVERTER_IDS;
    else process.env.AUXSOL_PERSIST_INVERTER_IDS = prevIds;
  });

  it('J) persistência desligada: nenhuma permissão de gravação', () => {
    process.env.AUXSOL_PERSIST_READINGS = 'false';
    process.env.AUXSOL_PERSIST_INVERTER_IDS = ULISSES;
    expect(isAuxsolPersistReadingsEnabled()).toBe(false);
    expect(isAuxsolInverterPersistAllowed(ULISSES)).toBe(false);
    expect(isReadingPersistAllowed({
      provider: 'AUXSOL',
      inverterId: ULISSES,
      runtimePersistable: false,
    })).toBe(false);
  });

  it('PERSIST=true sem allowlist não habilita indiscriminadamente', () => {
    process.env.AUXSOL_PERSIST_READINGS = 'true';
    delete process.env.AUXSOL_PERSIST_INVERTER_IDS;
    expect(parseAuxsolPersistInverterIds()).toEqual([]);
    expect(isAuxsolInverterPersistAllowed(ULISSES)).toBe(false);
  });

  it('H) allowlist: Ulisses permitido, José isolado', () => {
    process.env.AUXSOL_PERSIST_READINGS = 'true';
    process.env.AUXSOL_PERSIST_INVERTER_IDS = ULISSES;
    expect(isAuxsolInverterPersistAllowed(ULISSES)).toBe(true);
    expect(isAuxsolInverterPersistAllowed(JOSE)).toBe(false);
    expect(isReadingPersistAllowed({
      provider: 'AUXSOL',
      inverterId: JOSE,
      runtimePersistable: true,
    })).toBe(false);
  });

  it('runtimePersistable=false bloqueia mesmo com allowlist', () => {
    process.env.AUXSOL_PERSIST_READINGS = 'true';
    process.env.AUXSOL_PERSIST_INVERTER_IDS = ULISSES;
    expect(isReadingPersistAllowed({
      provider: 'AUXSOL',
      inverterId: ULISSES,
      runtimePersistable: false,
    })).toBe(false);
  });
});
