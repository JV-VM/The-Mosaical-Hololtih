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
    req.id = req.id ?? randomUUID();

    res.on('finish', () => {
      const ms = Date.now() - start;
      logger.info(
        {
          requestId: req.id,
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
