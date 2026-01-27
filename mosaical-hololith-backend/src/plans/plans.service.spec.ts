import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../shared/prisma/prisma.service';
import { PlansService, Quotas } from './plans.service';

function createPrismaMock() {
  return {
    plan: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    store: {
      count: jest.fn(),
    },
    product: {
      count: jest.fn(),
    },
  };
}

function subscriptionWithPlan(quotas: Quotas) {
  return {
    id: 'sub-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    status: 'ACTIVE',
    plan: {
      id: 'plan-1',
      code: 'free',
      name: 'Free',
      quotas,
      features: {},
    },
  };
}

describe('PlansService', () => {
  let service: PlansService;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);

    prismaMock.plan.upsert.mockReset();
    prismaMock.subscription.findUnique.mockReset();
    prismaMock.subscription.create.mockReset();
    prismaMock.store.count.mockReset();
    prismaMock.product.count.mockReset();
  });

  describe('ensureTenantSubscription', () => {
    it('creates a subscription when the tenant has none', async () => {
      prismaMock.plan.upsert.mockResolvedValue({ id: 'plan-1' });
      prismaMock.subscription.findUnique.mockResolvedValue(null);
      prismaMock.subscription.create.mockResolvedValue(
        subscriptionWithPlan({
          maxStores: 1,
          maxProductsPerStore: 10,
          maxProductsTotal: 10,
          maxTagTier: 1,
        }),
      );

      const result = await service.ensureTenantSubscription('tenant-1');

      expect(prismaMock.plan.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.subscription.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        include: { plan: true },
      });
      expect(prismaMock.subscription.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', planId: 'plan-1', status: 'ACTIVE' },
        include: { plan: true },
      });
      expect(result).toMatchObject({
        tenantId: 'tenant-1',
        plan: { id: 'plan-1' },
      });
    });
  });

  describe('assertCanCreateStore', () => {
    it('allows creation when usage is below the plan quota', async () => {
      const quotas: Quotas = {
        maxStores: 2,
        maxProductsPerStore: 10,
        maxProductsTotal: 10,
        maxTagTier: 1,
      };
      prismaMock.plan.upsert.mockResolvedValue({ id: 'plan-1' });
      prismaMock.subscription.findUnique.mockResolvedValue(
        subscriptionWithPlan(quotas),
      );
      prismaMock.store.count.mockResolvedValue(1);
      prismaMock.product.count.mockResolvedValue(0);

      await expect(
        service.assertCanCreateStore('tenant-1'),
      ).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when the store quota is reached', async () => {
      const quotas: Quotas = {
        maxStores: 1,
        maxProductsPerStore: 10,
        maxProductsTotal: 10,
        maxTagTier: 1,
      };
      prismaMock.plan.upsert.mockResolvedValue({ id: 'plan-1' });
      prismaMock.subscription.findUnique.mockResolvedValue(
        subscriptionWithPlan(quotas),
      );
      prismaMock.store.count.mockResolvedValue(1);
      prismaMock.product.count.mockResolvedValue(0);

      try {
        await service.assertCanCreateStore('tenant-1');
        throw new Error('Expected assertCanCreateStore to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        if (error instanceof Error) {
          expect(error.message).toContain('maxStores=1');
        }
      }
    });
  });

  describe('assertCanCreateProduct', () => {
    it('throws when maxProductsPerStore is exceeded', async () => {
      const quotas: Quotas = {
        maxStores: 1,
        maxProductsPerStore: 2,
        maxProductsTotal: 10,
        maxTagTier: 1,
      };
      prismaMock.plan.upsert.mockResolvedValue({ id: 'plan-1' });
      prismaMock.subscription.findUnique.mockResolvedValue(
        subscriptionWithPlan(quotas),
      );
      prismaMock.product.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0);

      await expect(
        service.assertCanCreateProduct('tenant-1', 'store-1'),
      ).rejects.toThrow(/maxProductsPerStore=2/);
    });

    it('throws when maxProductsTotal is reached', async () => {
      const quotas: Quotas = {
        maxStores: 1,
        maxProductsPerStore: 10,
        maxProductsTotal: 3,
        maxTagTier: 1,
      };
      prismaMock.plan.upsert.mockResolvedValue({ id: 'plan-1' });
      prismaMock.subscription.findUnique.mockResolvedValue(
        subscriptionWithPlan(quotas),
      );
      prismaMock.product.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(3);

      await expect(
        service.assertCanCreateProduct('tenant-1', 'store-1'),
      ).rejects.toThrow(/maxProductsTotal=3/);
    });
  });

  describe('assertTagTierAllowed', () => {
    it('throws when the tag tier is above the plan limit', async () => {
      const quotas: Quotas = {
        maxStores: 1,
        maxProductsPerStore: 10,
        maxProductsTotal: 10,
        maxTagTier: 1,
      };
      prismaMock.plan.upsert.mockResolvedValue({ id: 'plan-1' });
      prismaMock.subscription.findUnique.mockResolvedValue(
        subscriptionWithPlan(quotas),
      );

      await expect(service.assertTagTierAllowed('tenant-1', 2)).rejects.toThrow(
        /maxTagTier=1/,
      );
    });
  });
});
