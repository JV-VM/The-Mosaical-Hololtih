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

type RequestWithId = {
  id?: string;
  headers: Record<string, unknown>;
};

type ReplyWithHeader = {
  header: (name: string, value: string) => void;
};

const getHeaderString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const firstUnknown: unknown = value[0];
    return typeof firstUnknown === 'string' ? firstUnknown : undefined;
  }
  return undefined;
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

  fastify.addHook(
    'onRequest',
    (req: RequestWithId, reply: ReplyWithHeader, done: () => void) => {
      const headerRequestId = getHeaderString(req.headers[REQUEST_ID_HEADER]);
      const headerRequestIdValue =
        typeof headerRequestId === 'string' && headerRequestId.trim().length > 0
          ? headerRequestId
          : undefined;

      const requestId = req.id ?? headerRequestIdValue ?? randomUUID();
      req.id = requestId;
      reply.header(REQUEST_ID_HEADER, requestId);
      done();
    },
  );

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

describe('Plan enforcement', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await configureApp(app);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('Free plan: cannot create 2nd store', async () => {
    type RegisterResponse = { accessToken?: string };
    type TenantResponse = { id?: string };
    type ErrorResponse = { message?: string };

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: `p+${suffix}@p.com`, password: 'Password123!' },
    });
    expect(regRes.statusCode).toBe(201);

    const regBodyUnknown: unknown = regRes.json();
    const regBody = regBodyUnknown as RegisterResponse;
    const token = regBody.accessToken as string;

    const tenantRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: `Tenant ${suffix}` },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(tenantRes.statusCode).toBe(201);

    const tenantBodyUnknown: unknown = tenantRes.json();
    const tenantBody = tenantBodyUnknown as TenantResponse;
    const tenantId = tenantBody.id as string;

    await prisma.plan.upsert({
      where: { code: 'free' },
      update: {
        name: 'Free',
        quotas: {
          maxStores: 1,
          maxProductsPerStore: 10,
          maxProductsTotal: 10,
          maxTagTier: 1,
        },
        features: {},
      },
      create: {
        code: 'free',
        name: 'Free',
        quotas: {
          maxStores: 1,
          maxProductsPerStore: 10,
          maxProductsTotal: 10,
          maxTagTier: 1,
        },
        features: {},
      },
    });

    const store1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/stores',
      payload: {
        name: `S1 ${suffix}`,
        slug: `s1-${suffix}`,
        subdomain: `s1-${suffix}`,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': tenantId,
      },
    });
    expect(store1Res.statusCode).toBe(201);

    const store2Res = await app.inject({
      method: 'POST',
      url: '/api/v1/stores',
      payload: {
        name: `S2 ${suffix}`,
        slug: `s2-${suffix}`,
        subdomain: `s2-${suffix}`,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': tenantId,
      },
    });

    expect(store2Res.statusCode).toBe(403);
    const store2BodyUnknown: unknown = store2Res.json();
    const store2Body = store2BodyUnknown as ErrorResponse;
    const store2Message =
      typeof store2Body.message === 'string' ? store2Body.message : '';
    expect(store2Message).toContain('maxStores');
  });

  it('Free plan: cannot exceed maxProductsPerStore', async () => {
    type RegisterResponse = { accessToken?: string };
    type TenantResponse = { id?: string };
    type StoreResponse = { id?: string };
    type ErrorResponse = { message?: string };

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: `q+${suffix}@q.com`, password: 'Password123!' },
    });
    expect(regRes.statusCode).toBe(201);

    const regBodyUnknown: unknown = regRes.json();
    const regBody = regBodyUnknown as RegisterResponse;
    const token = regBody.accessToken as string;

    const tenantRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: `Tenant ${suffix}` },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(tenantRes.statusCode).toBe(201);

    const tenantBodyUnknown: unknown = tenantRes.json();
    const tenantBody = tenantBodyUnknown as TenantResponse;
    const tenantId = tenantBody.id as string;

    await prisma.plan.upsert({
      where: { code: 'free' },
      update: {
        name: 'Free',
        quotas: {
          maxStores: 1,
          maxProductsPerStore: 2,
          maxProductsTotal: 10,
          maxTagTier: 1,
        },
        features: {},
      },
      create: {
        code: 'free',
        name: 'Free',
        quotas: {
          maxStores: 1,
          maxProductsPerStore: 2,
          maxProductsTotal: 10,
          maxTagTier: 1,
        },
        features: {},
      },
    });

    const storeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/stores',
      payload: {
        name: `Store ${suffix}`,
        slug: `store-${suffix}`,
        subdomain: `store-${suffix}`,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': tenantId,
      },
    });
    expect(storeRes.statusCode).toBe(201);

    const storeBodyUnknown: unknown = storeRes.json();
    const storeBody = storeBodyUnknown as StoreResponse;
    const storeId = storeBody.id as string;

    for (let i = 1; i <= 2; i += 1) {
      const productRes = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: {
          storeId,
          title: `P${i} ${suffix}`,
          slug: `p${i}-${suffix}`,
          priceCents: 100,
        },
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
      });
      expect(productRes.statusCode).toBe(201);
    }

    const thirdProductRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: {
        storeId,
        title: `P3 ${suffix}`,
        slug: `p3-${suffix}`,
        priceCents: 100,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': tenantId,
      },
    });

    expect(thirdProductRes.statusCode).toBe(403);
    const thirdProductBodyUnknown: unknown = thirdProductRes.json();
    const thirdProductBody = thirdProductBodyUnknown as ErrorResponse;
    const thirdProductMessage =
      typeof thirdProductBody.message === 'string'
        ? thirdProductBody.message
        : '';
    expect(thirdProductMessage).toContain('maxProductsPerStore');
  });
});
