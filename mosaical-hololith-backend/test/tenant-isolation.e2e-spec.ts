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
import request from 'supertest';

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

    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `a+${suffix}@tenants.com`, password: 'Password123!' })
      .expect(201);

    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `b+${suffix}@tenants.com`, password: 'Password123!' })
      .expect(201);

    const tokenA = regA.body.accessToken;
    const tokenB = regB.body.accessToken;

    const tenantA = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `Tenant A ${suffix}` })
      .expect(201);

    const tenantB = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `Tenant B ${suffix}` })
      .expect(201);

    const tenantAId = tenantA.body.id;
    const tenantBId = tenantB.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Tenant-Id', tenantBId)
      .send({ name: `Store B ${suffix}`, slug: `store-b-${suffix}` })
      .expect(201);

    const forbidden = await request(app.getHttpServer())
      .get('/api/v1/stores')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-Id', tenantBId)
      .expect(403);

    expect(forbidden.body?.message || '').toContain('Not a member of this tenant');

    // Sanity check: A can access its own tenant context
    await request(app.getHttpServer())
      .get('/api/v1/stores')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-Id', tenantAId)
      .expect(200);
  });
});
