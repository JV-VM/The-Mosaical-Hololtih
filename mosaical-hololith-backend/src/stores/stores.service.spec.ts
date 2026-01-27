import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StoresService } from './stores.service';

function createPrismaMock() {
  return {
    store: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function createPlansMock() {
  return {
    assertCanCreateStore: jest.fn(),
  };
}

describe('StoresService', () => {
  let service: StoresService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let plansMock: ReturnType<typeof createPlansMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    plansMock = createPlansMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoresService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PlansService, useValue: plansMock },
      ],
    }).compile();

    service = module.get<StoresService>(StoresService);
    prismaMock.store.findUnique.mockReset();
    prismaMock.store.create.mockReset();
    prismaMock.store.update.mockReset();
    prismaMock.store.findMany.mockReset();
    plansMock.assertCanCreateStore.mockReset();
  });

  describe('createStore', () => {
    it('enforces plan and creates a draft store', async () => {
      prismaMock.store.findUnique.mockResolvedValue(null);
      const createdStore = { id: 'store-1', status: StoreStatus.DRAFT };
      prismaMock.store.create.mockResolvedValue(createdStore);

      const result = await service.createStore({
        tenantId: 'tenant-1',
        name: 'Store A',
        slug: 'store-a',
        subdomain: 'store-a',
      });

      expect(plansMock.assertCanCreateStore).toHaveBeenCalledWith('tenant-1');
      expect(prismaMock.store.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: 'Store A',
          slug: 'store-a',
          subdomain: 'store-a',
          customDomain: null,
          status: StoreStatus.DRAFT,
        },
      });
      expect(result).toBe(createdStore);
    });

    it('throws BadRequestException when the slug is already in use', async () => {
      prismaMock.store.findUnique
        .mockResolvedValueOnce({ id: 'other-store' })
        .mockResolvedValueOnce(null);

      await expect(
        service.createStore({
          tenantId: 'tenant-1',
          name: 'Store A',
          slug: 'store-a',
          subdomain: 'store-a',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.store.create).not.toHaveBeenCalled();
    });
  });

  describe('listStoresByTenant', () => {
    it('queries stores filtered by tenantId and ordered by createdAt desc', async () => {
      prismaMock.store.findMany.mockResolvedValue([]);

      await service.listStoresByTenant('tenant-1');

      const firstCallUnknown: unknown = prismaMock.store.findMany.mock.calls[0];
      expect(Array.isArray(firstCallUnknown)).toBe(true);
      if (!Array.isArray(firstCallUnknown)) {
        throw new Error('Expected prisma.store.findMany to be called');
      }

      const argsUnknown: unknown = (firstCallUnknown as unknown[])[0];
      if (!argsUnknown || typeof argsUnknown !== 'object') {
        throw new Error('Expected prisma.store.findMany args');
      }

      const args = argsUnknown as {
        where?: unknown;
        orderBy?: unknown;
        select?: unknown;
      };
      expect(args.where).toEqual({ tenantId: 'tenant-1' });
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
      expect(args.select).toBeDefined();
    });
  });

  describe('updateStore', () => {
    it('throws ForbiddenException when the store belongs to another tenant', async () => {
      prismaMock.store.findUnique.mockResolvedValue({
        id: 'store-1',
        tenantId: 'tenant-2',
        slug: 'store-a',
        subdomain: 'store-a',
      });

      await expect(
        service.updateStore({
          tenantId: 'tenant-1',
          storeId: 'store-1',
          patch: { name: 'New Name' },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('checks slug uniqueness when changing the slug', async () => {
      prismaMock.store.findUnique
        .mockResolvedValueOnce({
          id: 'store-1',
          tenantId: 'tenant-1',
          slug: 'store-a',
          subdomain: 'store-a',
        })
        .mockResolvedValueOnce({ id: 'other-store' })
        .mockResolvedValueOnce(null);

      await expect(
        service.updateStore({
          tenantId: 'tenant-1',
          storeId: 'store-1',
          patch: { slug: 'new-slug' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.store.update).not.toHaveBeenCalled();
    });
  });

  describe('publicGetStoreBySlug', () => {
    it('throws NotFoundException when the store is not published', async () => {
      prismaMock.store.findUnique.mockResolvedValue({
        id: 'store-1',
        slug: 'store-a',
        name: 'Store A',
        subdomain: 'store-a',
        customDomain: null,
        status: StoreStatus.DRAFT,
        createdAt: new Date(),
      });

      await expect(
        service.publicGetStoreBySlug('store-a'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
