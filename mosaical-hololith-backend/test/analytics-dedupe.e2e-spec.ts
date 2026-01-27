import 'dotenv/config';

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';

import { AppModule } from '../src/app.module';
import { env } from '../src/shared/env';
import { GlobalHttpExceptionFilter } from '../src/shared/filters/global-http-exception.filter';

const API_PREFIX = 'api/v1';
const REQUEST_ID_HEADER = 'x-request-id';
const ANALYTICS_VIEW_PATH = `/${API_PREFIX}/analytics/view`;
const AUTH_REGISTER_PATH = `/${API_PREFIX}/auth/register`;
const AUTH_LOGIN_PATH = `/${API_PREFIX}/auth/login`;
const AUTH_REFRESH_PATH = `/${API_PREFIX}/auth/refresh`;

type RateLimitOptions = { max: number; timeWindow: string };

type RouteOptionsLike = {
  url: string;
  method: string | string[];
  config?: Record<string, unknown> & {
    rateLimit?: RateLimitOptions;
  };
};

const RATE_LIMIT_DEFAULT: RateLimitOptions = {
  max: 200,
  timeWindow: '1 minute',
};
const RATE_LIMIT_ANALYTICS_VIEW: RateLimitOptions = {
  max: 60,
  timeWindow: '1 minute',
};
const RATE_LIMIT_AUTH_REGISTER: RateLimitOptions = {
  max: 5,
  timeWindow: '1 minute',
};
const RATE_LIMIT_AUTH_LOGIN: RateLimitOptions = {
  max: 10,
  timeWindow: '1 minute',
};
const RATE_LIMIT_AUTH_REFRESH: RateLimitOptions = {
  max: 30,
  timeWindow: '1 minute',
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is missing for e2e tests');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const configureApp = async (app: NestFastifyApplication) => {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(rateLimit, { global: false, ...RATE_LIMIT_DEFAULT });

  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', (req: any, reply: any, done: () => void) => {
    const headerRequestId = req.headers?.[REQUEST_ID_HEADER];
    const headerRequestIdValue =
      typeof headerRequestId === 'string' && headerRequestId.trim().length > 0
        ? headerRequestId
        : undefined;

    const requestId = req.id ?? headerRequestIdValue ?? randomUUID();
    req.id = requestId;
    reply.header(REQUEST_ID_HEADER, requestId);
    done();
  });

  fastify.addHook('onRoute', (routeOptions: RouteOptionsLike) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    const isPost = methods.includes('POST');

    const setRateLimit = (options: RateLimitOptions) => {
      routeOptions.config = routeOptions.config ?? {};
      routeOptions.config.rateLimit = options;
    };

    if (isPost && routeOptions.url === ANALYTICS_VIEW_PATH) {
      setRateLimit(RATE_LIMIT_ANALYTICS_VIEW);
      return;
    }

    if (isPost && routeOptions.url === AUTH_REGISTER_PATH) {
      setRateLimit(RATE_LIMIT_AUTH_REGISTER);
      return;
    }

    if (isPost && routeOptions.url === AUTH_LOGIN_PATH) {
      setRateLimit(RATE_LIMIT_AUTH_LOGIN);
      return;
    }

    if (isPost && routeOptions.url === AUTH_REFRESH_PATH) {
      setRateLimit(RATE_LIMIT_AUTH_REFRESH);
    }
  });

  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.setGlobalPrefix(API_PREFIX);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
};

describe('Analytics deduplication', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('dedupes same viewer on the same day, but counts different viewers and different days', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: `ana+${suffix}@a.com`, password: 'Password123!' },
    });
    expect(regRes.statusCode).toBe(201);

    const token = regRes.json().accessToken as string;

    const tenantRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: `Tenant ${suffix}` },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(tenantRes.statusCode).toBe(201);

    const tenantId = tenantRes.json().id as string;

    const storeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/stores',
      payload: { name: `Store ${suffix}`, slug: `store-${suffix}` },
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': tenantId,
      },
    });
    expect(storeRes.statusCode).toBe(201);

    const storeId = storeRes.json().id as string;

    const publishRes = await app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/publish`,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': tenantId,
      },
    });
    expect(publishRes.statusCode).toBe(201);

    const viewerA = `viewer-a-${suffix}`;
    const viewerB = `viewer-b-${suffix}`;

    const trackA1 = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/view',
      payload: { type: 'STORE_VIEW', storeId, viewerId: viewerA },
    });
    expect(trackA1.statusCode).toBe(201);

    const trackA2 = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/view',
      payload: { type: 'STORE_VIEW', storeId, viewerId: viewerA },
    });
    expect(trackA2.statusCode).toBe(201);

    let count = await prisma.analyticsEvent.count({
      where: { storeId, type: 'STORE_VIEW' },
    });
    expect(count).toBe(1);

    const trackB = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/view',
      payload: { type: 'STORE_VIEW', storeId, viewerId: viewerB },
    });
    expect(trackB.statusCode).toBe(201);

    count = await prisma.analyticsEvent.count({
      where: { storeId, type: 'STORE_VIEW' },
    });
    expect(count).toBe(2);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.analyticsEvent.updateMany({
      where: { storeId, type: 'STORE_VIEW' },
      data: { createdAt: yesterday },
    });

    const trackNextDay = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/view',
      payload: { type: 'STORE_VIEW', storeId, viewerId: viewerA },
    });
    expect(trackNextDay.statusCode).toBe(201);

    count = await prisma.analyticsEvent.count({
      where: { storeId, type: 'STORE_VIEW' },
    });
    expect(count).toBe(3);
  });
});
