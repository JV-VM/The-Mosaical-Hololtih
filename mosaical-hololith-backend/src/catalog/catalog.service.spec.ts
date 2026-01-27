import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus, StoreStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CatalogService } from './catalog.service';

function createPrismaMock() {
  return {
    store: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };
}

function createPlansMock() {
  return {
    assertCanCreateProduct: jest.fn(),
  };
}

describe('CatalogService', () => {
  let service: CatalogService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let plansMock: ReturnType<typeof createPlansMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    plansMock = createPlansMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PlansService, useValue: plansMock },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
    prismaMock.product.findUnique.mockReset();
    prismaMock.product.create.mockReset();
    prismaMock.product.update.mockReset();
    prismaMock.store.findUnique.mockReset();
    plansMock.assertCanCreateProduct.mockReset();
  });

  describe('createProduct', () => {
    it('enforces plan, checks uniqueness, and defaults currency', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);
      const createdProduct = {
        id: 'product-1',
        currency: 'USD',
        status: ProductStatus.DRAFT,
      };
      prismaMock.product.create.mockResolvedValue(createdProduct);

      const result = await service.createProduct({
        tenantId: 'tenant-1',
        storeId: 'store-1',
        title: 'Product A',
        slug: 'product-a',
        priceCents: 1234,
      });

      expect(plansMock.assertCanCreateProduct).toHaveBeenCalledWith(
        'tenant-1',
        'store-1',
      );

      const firstCallUnknown: unknown = prismaMock.product.create.mock.calls[0];
      expect(Array.isArray(firstCallUnknown)).toBe(true);
      if (!Array.isArray(firstCallUnknown)) {
        throw new Error('Expected prisma.product.create to be called');
      }

      const createArgsUnknown: unknown = (firstCallUnknown as unknown[])[0];
      if (!createArgsUnknown || typeof createArgsUnknown !== 'object') {
        throw new Error(
          'Expected prisma.product.create to be called with args',
        );
      }

      const createArgs = createArgsUnknown as {
        data: Record<string, unknown>;
        select: unknown;
      };

      expect(createArgs.data).toMatchObject({
        storeId: 'store-1',
        title: 'Product A',
        slug: 'product-a',
        description: null,
        priceCents: 1234,
        currency: 'USD',
        media: undefined,
        status: ProductStatus.DRAFT,
      });
      expect(createArgs.select).toBeDefined();
      expect(typeof createArgs.select).toBe('object');
      expect(result).toBe(createdProduct);
    });

    it('throws BadRequestException when the slug already exists in the store', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'existing-product',
      });

      await expect(
        service.createProduct({
          tenantId: 'tenant-1',
          storeId: 'store-1',
          title: 'Product A',
          slug: 'product-a',
          priceCents: 1234,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.product.create).not.toHaveBeenCalled();
    });
  });

  describe('updateProduct', () => {
    it('converts a nullable description patch into null and updates the product', async () => {
      prismaMock.product.findUnique.mockResolvedValueOnce({
        id: 'product-1',
        storeId: 'store-1',
        status: ProductStatus.DRAFT,
        slug: 'product-a',
        store: { tenantId: 'tenant-1' },
      });
      prismaMock.product.update.mockResolvedValue({
        id: 'product-1',
        description: null,
      });

      await service.updateProduct({
        tenantId: 'tenant-1',
        productId: 'product-1',
        patch: { description: null },
      });

      const firstCallUnknown: unknown = prismaMock.product.update.mock.calls[0];
      expect(Array.isArray(firstCallUnknown)).toBe(true);
      if (!Array.isArray(firstCallUnknown)) {
        throw new Error('Expected prisma.product.update to be called');
      }

      const argsUnknown: unknown = (firstCallUnknown as unknown[])[0];
      if (!argsUnknown || typeof argsUnknown !== 'object') {
        throw new Error('Expected prisma.product.update args');
      }

      const args = argsUnknown as { data?: Record<string, unknown> };
      expect(args.data).toMatchObject({ description: null });
    });

    it('throws ForbiddenException when the product belongs to another tenant', async () => {
      prismaMock.product.findUnique.mockResolvedValueOnce({
        id: 'product-1',
        storeId: 'store-1',
        status: ProductStatus.DRAFT,
        slug: 'product-a',
        store: { tenantId: 'tenant-2' },
      });

      await expect(
        service.updateProduct({
          tenantId: 'tenant-1',
          productId: 'product-1',
          patch: { title: 'New title' },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('publicListProductsByStoreSlug', () => {
    it('throws NotFoundException when the store is not published', async () => {
      prismaMock.store.findUnique.mockResolvedValue({
        id: 'store-1',
        slug: 'store-a',
        name: 'Store A',
        status: StoreStatus.DRAFT,
      });

      await expect(
        service.publicListProductsByStoreSlug('store-a'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
