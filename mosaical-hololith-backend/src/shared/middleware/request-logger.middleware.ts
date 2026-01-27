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

type RequestWithContext = {
  id?: string;
  headers: Record<string, unknown>;
  method: string;
  url: string;
  ip?: string;
  routeOptions?: { url?: string };
};

type ReplyWithRaw = {
  header: (name: string, value: string) => void;
  statusCode?: number;
  raw: {
    on: (event: 'finish', handler: () => void) => void;
  };
};

const getHeaderString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const firstUnknown: unknown = value[0];
    return typeof firstUnknown === 'string' ? firstUnknown : undefined;
  }
  return undefined;
};

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: ReplyWithRaw, next: () => void) {
    const start = Date.now();
    const headerRequestId = getHeaderString(req.headers['x-request-id']);
    const headerRequestIdValue =
      typeof headerRequestId === 'string' && headerRequestId.trim().length > 0
        ? headerRequestId
        : undefined;

    const requestId = req.id ?? headerRequestIdValue ?? randomUUID();
    req.id = requestId;

    res.header('x-request-id', requestId);

    res.raw.on('finish', () => {
      const ms = Date.now() - start;
      const userAgent = getHeaderString(req.headers['user-agent']);
      const tenantId = getHeaderString(req.headers['x-tenant-id']);
      const path = req.routeOptions?.url ?? req.url;

      logger.info(
        {
          requestId,
          method: req.method,
          path,
          statusCode: res.statusCode,
          durationMs: ms,
          ip: req.ip,
          userAgent,
          tenantId,
        },
        'http_request',
      );
    });

    next();
  }
}

export { logger };
