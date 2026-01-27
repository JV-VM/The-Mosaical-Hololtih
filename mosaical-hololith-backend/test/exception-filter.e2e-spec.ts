import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from '../src/shared/filters/global-http-exception.filter';

const makeHost = (request: any, response: any): ArgumentsHost =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  }) as ArgumentsHost;

describe('GlobalHttpExceptionFilter', () => {
  it('does not leak internal error messages for non-HTTP exceptions', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const response = { status };
    const request = { url: '/boom', id: 'req-1', headers: {} };
    const host = makeHost(request, response);

    const filter = new GlobalHttpExceptionFilter();
    filter.catch(new Error('sensitive details'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        path: '/boom',
        message: 'Internal server error',
        requestId: 'req-1',
      }),
    );
    expect(json.mock.calls[0][0].message).not.toContain('sensitive details');
  });

  it('preserves HttpException responses and adds requestId', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const response = { status };
    const request = { url: '/bad', headers: { 'x-request-id': 'req-2' } };
    const host = makeHost(request, response);

    const filter = new GlobalHttpExceptionFilter();
    filter.catch(new HttpException({ message: 'bad input' }, 400), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        path: '/bad',
        message: 'bad input',
        requestId: 'req-2',
      }),
    );
  });
});

