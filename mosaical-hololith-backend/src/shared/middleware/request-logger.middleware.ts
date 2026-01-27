import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { singleLine: true } }
      : undefined,
});

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const start = Date.now();
    const headerRequestId = req.headers?.['x-request-id'];
    const headerRequestIdValue =
      typeof headerRequestId === 'string' && headerRequestId.trim().length > 0
        ? headerRequestId
        : undefined;

    const requestId = req.id ?? headerRequestIdValue ?? randomUUID();
    req.id = requestId;

    if (typeof res.header === 'function') {
      res.header('x-request-id', requestId);
    } else if (typeof res.setHeader === 'function') {
      res.setHeader('x-request-id', requestId);
    } else if (res.raw && typeof res.raw.setHeader === 'function') {
      res.raw.setHeader('x-request-id', requestId);
    }

    res.on('finish', () => {
      const ms = Date.now() - start;
      logger.info(
        {
          requestId,
          method: req.method,
          path: req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          durationMs: ms,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          tenantId: req.headers['x-tenant-id'],
        },
        'http_request',
      );
    });

    next();
  }
}

export { logger };
