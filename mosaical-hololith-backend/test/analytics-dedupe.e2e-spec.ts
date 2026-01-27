import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

describe('Analytics deduplication', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('same viewerId + same store + same day should be 1 event', async () => {
    // Setup: create store and publish it (public analytics requires published)
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'ana@a.com', password: 'Password123!' })
      .expect(201);

    const token = reg.body.accessToken;

    const tenant = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'T' })
      .expect(201);

    const tenantId = tenant.body.id;

    const store = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({ name: 'S', slug: 's' })
      .expect(201);

    const storeId = store.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .expect(201);

    // track twice with same viewer
    const viewerId = 'viewer-12345678';

    await request(app.getHttpServer())
      .post('/api/v1/analytics/view')
      .send({ type: 'STORE_VIEW', storeId, viewerId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/analytics/view')
      .send({ type: 'STORE_VIEW', storeId, viewerId })
      .expect(201);

    const count = await prisma.analyticsEvent.count({ where: { storeId, type: 'STORE_VIEW' } });
    expect(count).toBe(1);
  });
});
