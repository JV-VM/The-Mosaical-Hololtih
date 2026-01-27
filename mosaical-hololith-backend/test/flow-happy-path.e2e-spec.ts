import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Happy Path (register -> tenant -> store)', () => {
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

  it('register -> create tenant -> create store', async () => {
    // 1) register
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'a@a.com', password: 'Password123!' })
      .expect(201);

    expect(register.body?.accessToken).toBeTruthy();

    const token = register.body.accessToken;

    // 2) create tenant
    const tenantRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tenant A' })
      .expect(201);

    const tenantId = tenantRes.body.id;
    expect(tenantId).toBeTruthy();

    // 3) create store (needs X-Tenant-Id)
    const storeRes = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .send({ name: 'My Store', slug: 'my-store' })
      .expect(201);

    expect(storeRes.body.slug).toBe('my-store');
  });
});
