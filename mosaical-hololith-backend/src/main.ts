import 'dotenv/config'; // keep this at the top if you’re relying on process.env early

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { AppModule } from './app.module';
import { env } from './shared/env';

const API_PREFIX = 'api/v1';
const ANALYTICS_VIEW_PATH = `/${API_PREFIX}/analytics/view`;
const RATE_LIMIT_DEFAULT = { max: 200, timeWindow: '1 minute' } as const;
const RATE_LIMIT_ANALYTICS_VIEW = { max: 60, timeWindow: '1 minute' } as const;

type RouteOptionsLike = {
  url: string;
  method: string | string[];
  config?: Record<string, unknown> & {
    rateLimit?: typeof RATE_LIMIT_ANALYTICS_VIEW;
  };
};

const setupValidation = (app: NestFastifyApplication) => {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
};

const setupSecurity = async (app: NestFastifyApplication) => {
  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
};

const setupRateLimit = async (app: NestFastifyApplication) => {
  await app.register(rateLimit, {
    global: false,
    ...RATE_LIMIT_DEFAULT,
  });

  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook('onRoute', (routeOptions: RouteOptionsLike) => {
    if (
      routeOptions.url === ANALYTICS_VIEW_PATH &&
      routeOptions.method === 'POST'
    ) {
      routeOptions.config = routeOptions.config ?? {};
      routeOptions.config.rateLimit = RATE_LIMIT_ANALYTICS_VIEW;
    }
  });
};

const setupSwagger = (app: NestFastifyApplication) => {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mosaical Hololith API')
    .setDescription(
      'Backend API for Mosaical Hololith (Hub + Stores + Dashboard)',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/docs', app, document);
};

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  setupValidation(app);
  await setupSecurity(app);
  await setupRateLimit(app);
  setupSwagger(app);

  app.setGlobalPrefix(API_PREFIX);
  await app.listen(env.PORT, '0.0.0.0');
  console.log(`API running on http://localhost:${env.PORT}/api/v1`);
  console.log(`Swagger on http://localhost:${env.PORT}/docs`);
}

void bootstrap();
