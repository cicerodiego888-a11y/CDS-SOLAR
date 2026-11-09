import { getPermissionsForRole, getRoleLabel, hasPermission, normalizeProfile } from './permissions.catalog';

describe('Catálogo de perfis e permissões', () => {
  it('normaliza perfis legado e novos', () => {
    expect(normalizeProfile('ADMIN')).toBe('ADMINISTRADOR');
    expect(normalizeProfile('OPERATOR')).toBe('OPERADOR');
    expect(getRoleLabel('POS_VENDA')).toBe('Pós-venda');
    expect(getRoleLabel('TECNICO')).toBe('Técnico');
  });

  it('concede acesso completo ao administrador', () => {
    expect(hasPermission('ADMIN', 'USERS_DELETE')).toBe(true);
    expect(hasPermission('ADMINISTRADOR', 'PLANTS_CREATE')).toBe(true);
    expect(hasPermission('ADMINISTRADOR', 'USERS_MEMBERSHIPS_VIEW')).toBe(true);
  });

  it('reconhece INVESTIDOR e CONSUMIDOR', () => {
    expect(normalizeProfile('INVESTIDOR')).toBe('INVESTIDOR');
    expect(getRoleLabel('CONSUMIDOR')).toBe('Consumidor');
    expect(hasPermission('INVESTIDOR', 'MONITORING_VIEW')).toBe(true);
    expect(hasPermission('CONSUMIDOR', 'SETTINGS_VIEW')).toBe(false);
  });

  it('restringe operador sem gestão de usuários', () => {
    expect(hasPermission('OPERADOR', 'DASHBOARD_VIEW')).toBe(true);
    expect(hasPermission('OPERADOR', 'USERS_DELETE')).toBe(false);
    expect(getPermissionsForRole('COMERCIAL')).toContain('CUSTOMERS_VIEW');
  });

  it('concede cadastro energético mínimo a admin e comercial', () => {
    expect(hasPermission('ADMIN', 'DISTRIBUTORS_CREATE')).toBe(true);
    expect(hasPermission('COMERCIAL', 'CONSUMERS_UPDATE')).toBe(true);
    expect(hasPermission('COMERCIAL', 'CONSUMER_UNITS_CREATE')).toBe(true);
    expect(hasPermission('OPERADOR', 'DISTRIBUTORS_VIEW')).toBe(true);
    expect(hasPermission('OPERADOR', 'DISTRIBUTORS_CREATE')).toBe(false);
    expect(hasPermission('CONSUMIDOR', 'CONSUMER_UNITS_VIEW')).toBe(false);
  });

  it('concede ENERGY_VIEW à fundação de Gestão de Energia', () => {
    expect(hasPermission('ADMINISTRADOR', 'ENERGY_VIEW')).toBe(true);
    expect(hasPermission('OPERADOR', 'ENERGY_VIEW')).toBe(true);
    expect(hasPermission('COMERCIAL', 'ENERGY_VIEW')).toBe(true);
    expect(hasPermission('INVESTIDOR', 'ENERGY_VIEW')).toBe(false);
  });

  it('concede ENERGY_UPDATE para mutações de Rateio', () => {
    expect(hasPermission('ADMIN', 'ENERGY_UPDATE')).toBe(true);
    expect(hasPermission('OPERADOR', 'ENERGY_UPDATE')).toBe(true);
    expect(hasPermission('COMERCIAL', 'ENERGY_UPDATE')).toBe(true);
    expect(hasPermission('TECNICO', 'ENERGY_UPDATE')).toBe(false);
    expect(hasPermission('POS_VENDA', 'ENERGY_UPDATE')).toBe(false);
  });
});
