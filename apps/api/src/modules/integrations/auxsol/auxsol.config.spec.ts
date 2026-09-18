import {
  auxsolAppId,
  auxsolAppSecret,
  auxsolInvertersByPlantPath,
  auxsolLiveCredentialsConfigured,
  auxsolMockAllowed,
  auxsolPlantListPath,
  resolveAuxsolMode,
} from './auxsol.config';

describe('Configuração AUXSOL', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('não ativa mock silenciosamente em produção', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUXSOL_MOCK_MODE = 'true';
    delete process.env.AUXSOL_ALLOW_MOCK_IN_PRODUCTION;
    expect(auxsolMockAllowed()).toBe(false);
    expect(resolveAuxsolMode()).toBe('blocked');
  });

  it('permanece bloqueado sem URL oficial', () => {
    delete process.env.AUXSOL_API_BASE_URL;
    process.env.AUXSOL_MOCK_MODE = 'false';
    expect(resolveAuxsolMode()).toBe('blocked');
  });

  it('resolve APP_ID e APP_SECRET do ambiente', () => {
    process.env.AUXSOL_APP_ID = ' app-1 ';
    process.env.AUXSOL_APP_SECRET = ' secret-1 ';
    delete process.env.AUXSOL_SECRET_REF;
    expect(auxsolAppId()).toBe('app-1');
    expect(auxsolAppSecret()).toBe('secret-1');
  });

  it('resolve secret via AUXSOL_SECRET_REF quando APP_SECRET ausente', () => {
    delete process.env.AUXSOL_APP_SECRET;
    process.env.AUXSOL_SECRET_REF = 'MY_AUXSOL_SECRET';
    process.env.MY_AUXSOL_SECRET = 'from-ref';
    expect(auxsolAppSecret()).toBe('from-ref');
  });

  it('exige base URL + app id + secret para live credentials', () => {
    process.env.AUXSOL_API_BASE_URL = 'https://auxsol.example.test';
    process.env.AUXSOL_APP_ID = 'id';
    process.env.AUXSOL_APP_SECRET = 'secret';
    expect(auxsolLiveCredentialsConfigured()).toBe(true);
    delete process.env.AUXSOL_APP_SECRET;
    delete process.env.AUXSOL_SECRET_REF;
    expect(auxsolLiveCredentialsConfigured()).toBe(false);
  });

  it('monta paths oficiais de descoberta com current/size e plantId', () => {
    expect(auxsolPlantListPath({ current: 1, size: 100 })).toBe('/archive/plant/list?current=1&size=100');
    expect(auxsolInvertersByPlantPath('plant-1')).toBe('/archive/inverter/getInverterByPlant/plant-1');
  });
});
