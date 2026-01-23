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

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

  app.setGlobalPrefix('api/v1');

  // ✅ Swagger
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

  await app.listen(env.PORT, '0.0.0.0');
  console.log(`API running on http://localhost:${env.PORT}/api/v1`);
  console.log(`Swagger on http://localhost:${env.PORT}/docs`);
}

bootstrap();
