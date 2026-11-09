import { findAuxsolIdentityInInventory } from './auxsol-identity.lookup';

describe('findAuxsolIdentityInInventory', () => {
  const inventory = [{
    plant: { plantId: 'p1', plantName: 'A', owner: null, capacity: null, status: null, address: null },
    inverters: [{
      inverterId: 'ext-1',
      sn: 'ASN-10SL2508230101',
      model: 'ASN-10SL',
      ratedPower: null,
      gateway: 'GW1',
      identifiers: {},
    }],
  }];

  it('encontra por SN sem fallback para outro serial', () => {
    const match = findAuxsolIdentityInInventory(inventory, 'ASN-10SL2508230101');
    expect(match.found).toBe(true);
    if (match.found) expect(match.inverterId).toBe('ext-1');
  });

  it('encontra por inverterId oficial', () => {
    const match = findAuxsolIdentityInInventory(inventory, 'ext-1');
    expect(match.found).toBe(true);
  });

  it('TARGET_NOT_FOUND para serial ausente do escopo', () => {
    const match = findAuxsolIdentityInInventory(inventory, 'ASN-10SL251016000352');
    expect(match.found).toBe(false);
  });
});
