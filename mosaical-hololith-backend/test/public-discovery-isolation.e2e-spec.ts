import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Public discovery isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('explore should not return unpublished stores/products', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'iso@a.com', password: 'Password123!' })
      .expect(201);

    const token = reg.body.accessToken;

    const tenant = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'T' })
      .expect(201);

    const tenantId = tenant.body.id;

    // create store (draft by default)
    const store = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({ name: 'Draft Store', slug: 'draft-store' })
      .expect(201);

    const storeId = store.body.id;

    // create product (draft by default)
    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({
        storeId,
        title: 'Draft Product',
        slug: 'draft-product',
        priceCents: 100,
      })
      .expect(201);

    const explore = await request(app.getHttpServer())
      .get('/api/v1/explore?type=all')
      .expect(200);

    const stores = explore.body?.results?.stores ?? [];
    const products = explore.body?.results?.products ?? [];

    expect(stores.find((s: any) => s.slug === 'draft-store')).toBeFalsy();
    expect(products.find((p: any) => p.slug === 'draft-product')).toBeFalsy();
  });
});
