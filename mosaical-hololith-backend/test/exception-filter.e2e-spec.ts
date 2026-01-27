import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from '../src/shared/filters/global-http-exception.filter';

type RequestLike = {
  url: string;
  routeOptions?: { url?: string };
  id?: string;
  headers: Record<string, unknown>;
};

type ResponseLike = {
  code?: (statusCode: number) => ResponseLike;
  status?: (statusCode: number) => ResponseLike;
  send: (body: Record<string, unknown>) => void;
};

const makeHost = (
  request: RequestLike,
  response: ResponseLike,
): ArgumentsHost =>
  ({
    switchToHttp: () => ({
      getRequest: (): RequestLike => request,
      getResponse: (): ResponseLike => response,
    }),
  }) as unknown as ArgumentsHost;

const getSentBody = (sendMock: jest.Mock): Record<string, unknown> => {
  const firstCallUnknown: unknown = sendMock.mock.calls[0];
  expect(Array.isArray(firstCallUnknown)).toBe(true);
  if (!Array.isArray(firstCallUnknown)) {
    throw new Error('Expected response.send to be called');
  }

  const bodyUnknown: unknown = (firstCallUnknown as unknown[])[0];
  if (!bodyUnknown || typeof bodyUnknown !== 'object') {
    throw new Error('Expected body object');
  }

  return bodyUnknown as Record<string, unknown>;
};

describe('GlobalHttpExceptionFilter', () => {
  it('does not leak internal error messages for non-HTTP exceptions', () => {
    const response: ResponseLike = {
      code: jest.fn(),
      send: jest.fn(),
    };
    (response.code as jest.Mock).mockImplementation(() => response);
    const request: RequestLike = { url: '/boom', id: 'req-1', headers: {} };
    const host = makeHost(request, response);

    const filter = new GlobalHttpExceptionFilter();
    filter.catch(new Error('sensitive details'), host);

    expect(response.code).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const body = getSentBody(response.send as jest.Mock);
    expect(body).toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      path: '/boom',
      message: 'Internal server error',
      requestId: 'req-1',
    });
    expect(body.message).not.toBe('sensitive details');
  });

  it('preserves HttpException responses and adds requestId', () => {
    const response: ResponseLike = {
      code: jest.fn(),
      send: jest.fn(),
    };
    (response.code as jest.Mock).mockImplementation(() => response);
    const request: RequestLike = {
      url: '/bad',
      headers: { 'x-request-id': 'req-2' },
    };
    const host = makeHost(request, response);

    const filter = new GlobalHttpExceptionFilter();
    filter.catch(new HttpException({ message: 'bad input' }, 400), host);

    expect(response.code).toHaveBeenCalledWith(400);
    const body = getSentBody(response.send as jest.Mock);
    expect(body).toMatchObject({
      statusCode: 400,
      path: '/bad',
      message: 'bad input',
      requestId: 'req-2',
    });
  });
});
