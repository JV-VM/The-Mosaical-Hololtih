import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { logger } from '../middleware/request-logger.middleware';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const headerRequestId = request?.headers?.['x-request-id'];
    const requestId =
      request?.id ??
      (typeof headerRequestId === 'string' && headerRequestId.trim().length > 0
        ? headerRequestId
        : undefined);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        logger.error(
          {
            requestId,
            statusCode: status,
            path: request?.url,
            err: exception,
          },
          'http_exception',
        );
      }

      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request?.url,
        ...(typeof message === 'object' ? message : { message }),
        requestId,
      });
      return;
    }

    // Non-HTTP exceptions: never leak internal error details to clients.
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    logger.error(
      {
        requestId,
        statusCode: status,
        path: request?.url,
        err: exception,
      },
      'unhandled_exception',
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request?.url,
      message: 'Internal server error',
      requestId,
    });
  }
}
