import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

describe('Plan enforcement', () => {
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

  it('Free plan: cannot create 2nd store', async () => {
    // register
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'p@p.com', password: 'Password123!' })
      .expect(201);

    const token = reg.body.accessToken;

    // tenant
    const tenant = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'T' })
      .expect(201);

    const tenantId = tenant.body.id;

    // seed plans (ensure Free exists)
    // If you already seed on boot, remove this.
    await prisma.plan.upsert({
      where: { code: 'free' },
      update: {},
      create: {
        code: 'free',
        name: 'Free',
        quotas: { maxStores: 1, maxProductsPerStore: 10, maxProductsTotal: 10, maxTagTier: 1 },
        features: {},
      },
    });

    // store 1 OK
    await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({ name: 'S1', slug: 's1' })
      .expect(201);

    // store 2 should fail
    const res = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({ name: 'S2', slug: 's2' })
      .expect(403);

    expect(res.body?.message || '').toContain('maxStores');
  });

  it('Free plan: cannot exceed maxProductsPerStore', async () => {
    // register + tenant
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'q@q.com', password: 'Password123!' })
      .expect(201);

    const token = reg.body.accessToken;

    const tenant = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'T2' })
      .expect(201);

    const tenantId = tenant.body.id;

    await prisma.plan.upsert({
      where: { code: 'free' },
      update: {},
      create: {
        code: 'free',
        name: 'Free',
        quotas: { maxStores: 1, maxProductsPerStore: 2, maxProductsTotal: 10, maxTagTier: 1 }, // set small for test
        features: {},
      },
    });

    // create store
    const store = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({ name: 'S', slug: 'store' })
      .expect(201);

    const storeId = store.body.id;

    // create 2 products OK
    for (let i = 1; i <= 2; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', tenantId)
        .send({ storeId, title: `P${i}`, slug: `p${i}`, priceCents: 100 })
        .expect(201);
    }

    // 3rd should fail
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({ storeId, title: 'P3', slug: 'p3', priceCents: 100 })
      .expect(403);

    expect(res.body?.message || '').toContain('maxProductsPerStore');
  });
});
