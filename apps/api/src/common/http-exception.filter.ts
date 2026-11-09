import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

function resolveErrorCode(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'code' in body) {
    const semantic = (body as { code?: unknown }).code;
    if (typeof semantic === 'string' && semantic.trim()) {
      return semantic.trim();
    }
  }
  if (status >= 500) return 'INTERNAL_SERVER_ERROR';
  if (status === 404) return 'RESOURCE_NOT_FOUND';
  return 'HTTP_ERROR';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest<{ url?: string; requestId?: string }>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const message = typeof body === 'string'
      ? body
      : body && typeof body === 'object' && 'message' in body
        ? (body as { message?: string | string[] }).message
        : 'Erro interno do servidor.';

    response.status(status).json({
      statusCode: status,
      code: resolveErrorCode(status, body),
      message,
      path: request.url ?? null,
      requestId: request.requestId ?? null,
    });
  }
}
