import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { assertProductionJwtConfiguration } from './modules/auth/jwt-secrets';

function corsOrigins() {
  const configured = process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3002';
  const origins = configured.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.includes('*') && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS não pode usar wildcard em produção.');
  }
  return origins;
}

async function bootstrap() {
  assertProductionJwtConfiguration();
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.use((request: { headers?: Record<string, string | string[] | undefined>; requestId?: string }, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    const incoming = request.headers?.['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.trim() ? incoming.trim().slice(0, 128) : crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(process.env.API_PORT || 3001);
}
bootstrap().catch((error: unknown) => {
  console.error('API startup failed', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
