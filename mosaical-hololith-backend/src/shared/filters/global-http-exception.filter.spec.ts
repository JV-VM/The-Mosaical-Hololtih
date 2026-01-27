import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

jest.mock('../middleware/request-logger.middleware', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

import { logger } from '../middleware/request-logger.middleware';
import { GlobalHttpExceptionFilter } from './global-http-exception.filter';

type RequestLike = {
  id?: string;
  url: string;
  routeOptions?: { url?: string };
  headers: Record<string, unknown>;
};

type ResponseLike = {
  code?: (statusCode: number) => ResponseLike;
  status?: (statusCode: number) => ResponseLike;
  send: (body: Record<string, unknown>) => void;
};

function createHost(
  request: RequestLike,
  response: ResponseLike,
): ArgumentsHost {
  const hostLike = {
    switchToHttp: () => ({
      getRequest: (): RequestLike => request,
      getResponse: (): ResponseLike => response,
    }),
  };

  return hostLike as unknown as ArgumentsHost;
}

function getSentBody(sendMock: jest.Mock): Record<string, unknown> {
  const firstCallUnknown: unknown = sendMock.mock.calls[0];
  expect(Array.isArray(firstCallUnknown)).toBe(true);
  if (!Array.isArray(firstCallUnknown)) {
    throw new Error('Expected send to be called');
  }

  const bodyUnknown: unknown = (firstCallUnknown as unknown[])[0];
  if (!bodyUnknown || typeof bodyUnknown !== 'object') {
    throw new Error('Expected body object');
  }

  return bodyUnknown as Record<string, unknown>;
}

describe('GlobalHttpExceptionFilter', () => {
  let filter: GlobalHttpExceptionFilter;

  beforeEach(() => {
    filter = new GlobalHttpExceptionFilter();
    (logger.error as jest.Mock).mockClear();
  });

  it('uses the HttpException status and response payload', () => {
    const response: ResponseLike = {
      code: jest.fn(),
      send: jest.fn(),
    };
    (response.code as jest.Mock).mockImplementation(() => response);

    const request: RequestLike = {
      url: '/bad-request',
      headers: { 'x-request-id': 'req-1' },
    };

    const host = createHost(request, response);
    filter.catch(new HttpException({ message: 'bad input' }, 400), host);

    expect(response.code).toHaveBeenCalledWith(400);
    const body = getSentBody(response.send as jest.Mock);
    expect(body).toMatchObject({
      statusCode: 400,
      path: '/bad-request',
      message: 'bad input',
      requestId: 'req-1',
    });
  });

  it('sanitizes unknown errors to 500 while preserving requestId', () => {
    const response: ResponseLike = {
      code: jest.fn(),
      send: jest.fn(),
    };
    (response.code as jest.Mock).mockImplementation(() => response);

    const request: RequestLike = {
      id: 'req-2',
      url: '/boom',
      headers: {},
    };

    const host = createHost(request, response);
    filter.catch(new Error('sensitive details'), host);

    expect(response.code).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const body = getSentBody(response.send as jest.Mock);
    expect(body).toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      path: '/boom',
      message: 'Internal server error',
      requestId: 'req-2',
    });
    expect(body.message).not.toBe('sensitive details');

    expect(logger.error).toHaveBeenCalled();
    const logArgs = JSON.stringify((logger.error as jest.Mock).mock.calls);
    expect(logArgs).not.toContain('sensitive details');
  });
});
