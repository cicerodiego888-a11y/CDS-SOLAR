import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser, JwtPayload } from './auth.types';
import { getPermissionsForRole, getRoleLabel, normalizeProfile } from './permissions.catalog';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const identifier = email.trim();
    const secret = password.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { name: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });
    if (!user || !(await bcrypt.compare(secret, user.passwordHash))) {
      throw new UnauthorizedException('Usuário ou senha inválidos.');
    }
    const publicUser = this.toPublicUser(user);
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    } satisfies JwtPayload);
    return { accessToken, user: publicUser };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Acesso não autorizado');
    return this.toPublicUser(user);
  }

  toPublicUser(user: { id: string; name: string; email: string; role: string }): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      profile: normalizeProfile(user.role),
      profileLabel: getRoleLabel(user.role),
      permissions: getPermissionsForRole(user.role),
    };
  }
}
