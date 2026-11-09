import { HttpException, HttpStatus } from '@nestjs/common';
import { CollectionError } from '../modules/integrations/collection/collection.errors';
import { HttpExceptionFilter } from './http-exception.filter';

function hostWith(url = '/api/integrations/collect/i1') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    json,
    status,
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url, requestId: 'req-1' }),
      }),
    },
  };
}

describe('HttpExceptionFilter', () => {
  it('11) preserva CONCURRENT_COLLECTION no code da resposta', () => {
    const { host, status, json } = hostWith();
    const filter = new HttpExceptionFilter();
    filter.catch(
      new CollectionError('CONCURRENT_COLLECTION', 'Já existe uma coleta em andamento para este inversor.', 409),
      host as never,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 409,
      code: 'CONCURRENT_COLLECTION',
      message: 'Já existe uma coleta em andamento para este inversor.',
      path: '/api/integrations/collect/i1',
      requestId: 'req-1',
    }));
  });

  it('mantém RESOURCE_NOT_FOUND para 404 sem code semântico', () => {
    const { host, json } = hostWith('/api/plants/x');
    new HttpExceptionFilter().catch(new HttpException('Usina não encontrada.', HttpStatus.NOT_FOUND), host as never);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
    }));
  });

  it('não altera 500 genérico para code semântico inventado', () => {
    const { host, json } = hostWith();
    new HttpExceptionFilter().catch(new Error('boom'), host as never);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
    }));
  });
});
