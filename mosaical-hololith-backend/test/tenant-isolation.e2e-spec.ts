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

describe('Tenant isolation (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('user A cannot access tenant B resources', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const regARes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: `a+${suffix}@tenants.com`, password: 'Password123!' },
    });
    expect(regARes.statusCode).toBe(201);

    const regBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: `b+${suffix}@tenants.com`, password: 'Password123!' },
    });
    expect(regBRes.statusCode).toBe(201);

    const tokenA = regARes.json().accessToken as string;
    const tokenB = regBRes.json().accessToken as string;

    const tenantARes = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: `Tenant A ${suffix}` },
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(tenantARes.statusCode).toBe(201);

    const tenantBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: `Tenant B ${suffix}` },
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(tenantBRes.statusCode).toBe(201);

    const tenantAId = tenantARes.json().id as string;
    const tenantBId = tenantBRes.json().id as string;

    const storeBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/stores',
      payload: { name: `Store B ${suffix}`, slug: `store-b-${suffix}` },
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'X-Tenant-Id': tenantBId,
      },
    });
    expect(storeBRes.statusCode).toBe(201);

    const forbiddenRes = await app.inject({
      method: 'GET',
      url: '/api/v1/stores',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Tenant-Id': tenantBId,
      },
    });

    expect(forbiddenRes.statusCode).toBe(403);
    expect(forbiddenRes.json().message || '').toContain('Not a member of this tenant');

    const ownTenantRes = await app.inject({
      method: 'GET',
      url: '/api/v1/stores',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Tenant-Id': tenantAId,
      },
    });

    expect(ownTenantRes.statusCode).toBe(200);
  });
});
