import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  let service: AuthService;
  let prisma: { user: { findFirst: jest.Mock; findUnique: jest.Mock } };
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('B7@123456', 4);
  });

  beforeEach(() => {
    prisma = { user: { findFirst: jest.fn(), findUnique: jest.fn() } };
    service = new AuthService(prisma as never, jwt);
  });

  const user = () => ({
    id: 'user-1',
    name: 'Administrador B7 Solar',
    email: 'admin@b7solar.local',
    passwordHash,
    role: 'ADMIN',
  });

  it('autentica com credenciais corretas e não devolve hash', async () => {
    prisma.user.findFirst.mockResolvedValue(user());
    const result = await service.login('admin@b7solar.local', 'B7@123456');
    expect(result.accessToken).toBeTruthy();
    expect(result.user.email).toBe('admin@b7solar.local');
    expect(result.user.profileLabel).toBe('Administrador');
    expect(JSON.stringify(result)).not.toContain(passwordHash);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toMatch(/B7@123456/);
  });

  it('rejeita senha inválida com mensagem genérica', async () => {
    prisma.user.findFirst.mockResolvedValue(user());
    await expect(service.login('admin@b7solar.local', 'errada123')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('autentica pelo nome do usuário', async () => {
    prisma.user.findFirst.mockResolvedValue(user());
    const result = await service.login('Diego', 'B7@123456');
    expect(result.user.name).toBe('Administrador B7 Solar');
  });

  it('ignora espaços nas bordas do usuário e da senha', async () => {
    prisma.user.findFirst.mockResolvedValue(user());
    const result = await service.login('  Diego  ', '  B7@123456  ');
    expect(result.accessToken).toBeTruthy();
  });

  it('rejeita usuário inexistente com a mesma falha', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.login('naoexiste@b7solar.local', 'B7@123456')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('retorna o usuário autenticado em me()', async () => {
    prisma.user.findUnique.mockResolvedValue(user());
    const me = await service.me('user-1');
    expect(me.id).toBe('user-1');
    expect(me.permissions).toContain('USERS_DELETE');
    expect(me).not.toHaveProperty('passwordHash');
  });
});
