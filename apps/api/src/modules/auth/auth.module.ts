import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { AuthorizationService, MembershipsService } from './authorization.service';
import { MembershipsController } from './memberships.controller';
import { resolveJwtSigningSecret } from './jwt-secrets';

@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSigningSecret(),
      signOptions: { expiresIn: '8h' },
    }),
  ],
  providers: [
    AuthService,
    AuthorizationService,
    MembershipsService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  controllers: [AuthController, MembershipsController],
  exports: [AuthService, AuthorizationService, MembershipsService, JwtModule, JwtAuthGuard, PermissionsGuard],
})
export class AuthModule {}
