import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { logger } from '../middleware/request-logger.middleware';

type RequestWithContext = {
  id?: string;
  headers: Record<string, unknown>;
  url: string;
  routeOptions?: { url?: string };
};

type ResponseLike = {
  code?: (statusCode: number) => ResponseLike;
  status?: (statusCode: number) => ResponseLike;
  send: (body: Record<string, unknown>) => void;
};

const getHeaderString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const firstUnknown: unknown = value[0];
    return typeof firstUnknown === 'string' ? firstUnknown : undefined;
  }
  return undefined;
};

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ResponseLike>();
    const request = ctx.getRequest<RequestWithContext>();
    const headerRequestId = getHeaderString(request.headers['x-request-id']);
    const requestId = request.id ?? headerRequestId;
    const path = request.routeOptions?.url ?? request.url;

    const sendResponse = (
      statusCode: number,
      body: Record<string, unknown>,
    ) => {
      if (typeof response.code === 'function') {
        response.code(statusCode).send(body);
        return;
      }

      if (typeof response.status === 'function') {
        response.status(statusCode).send(body);
        return;
      }

      response.send(body);
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const messageBody: unknown = exception.getResponse();

      if (status >= 500) {
        logger.error(
          {
            requestId,
            statusCode: status,
            path,
            err: exception,
          },
          'http_exception',
        );
      }

      sendResponse(status, {
        statusCode: status,
        timestamp: new Date().toISOString(),
        path,
        ...(typeof messageBody === 'object' && messageBody !== null
          ? (messageBody as Record<string, unknown>)
          : { message: messageBody }),
        requestId,
      });
      return;
    }

    // Non-HTTP exceptions: never leak internal error details to clients.
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const isTestEnv = process.env.NODE_ENV === 'test';
    const isProdEnv = process.env.NODE_ENV === 'production';
    const errorPayload =
      exception instanceof Error
        ? {
            type: exception.name,
            ...(isTestEnv ? {} : { stack: exception.stack }),
            ...(isProdEnv || isTestEnv ? {} : { message: exception.message }),
          }
        : { type: 'UnknownError' };

    logger.error(
      {
        requestId,
        statusCode: status,
        path,
        err: errorPayload,
      },
      'unhandled_exception',
    );

    sendResponse(status, {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path,
      message: 'Internal server error',
      requestId,
    });
  }
}
