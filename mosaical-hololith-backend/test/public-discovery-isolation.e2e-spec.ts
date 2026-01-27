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

describe('Public discovery isolation', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('explore should not return unpublished stores/products', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `iso+${suffix}@a.com`, password: 'Password123!' })
      .expect(201);

    const token = reg.body.accessToken;

    const tenant = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Tenant ${suffix}` })
      .expect(201);

    const tenantId = tenant.body.id;

    const store = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({ name: `Store ${suffix}`, slug: `store-${suffix}` })
      .expect(201);

    const storeId = store.body.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({
        storeId,
        title: `Product ${suffix}`,
        slug: `product-${suffix}`,
        priceCents: 100,
      })
      .expect(201);

    const productId = product.body.id;

    // Explore should not show draft content
    const exploreDraft = await request(app.getHttpServer())
      .get('/api/v1/explore')
      .expect(200);

    expect(JSON.stringify(exploreDraft.body)).not.toContain(storeId);
    expect(JSON.stringify(exploreDraft.body)).not.toContain(productId);

    // Publish and verify it appears
    await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .expect(201);

    const explorePublished = await request(app.getHttpServer())
      .get('/api/v1/explore')
      .expect(200);

    expect(JSON.stringify(explorePublished.body)).toContain(storeId);
    expect(JSON.stringify(explorePublished.body)).toContain(productId);
  });
});
