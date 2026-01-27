import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { TagsService } from './tags.service';

function createPrismaMock() {
  return {
    store: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    tag: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    storeTag: {
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    productTag: {
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };
}

function createPlansMock() {
  return {
    assertTagTierAllowed: jest.fn(),
  };
}

describe('TagsService', () => {
  let service: TagsService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let plansMock: ReturnType<typeof createPlansMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    plansMock = createPlansMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PlansService, useValue: plansMock },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
    prismaMock.tag.findUnique.mockReset();
    prismaMock.tag.create.mockReset();
    prismaMock.product.findUnique.mockReset();
    prismaMock.productTag.upsert.mockReset();
    plansMock.assertTagTierAllowed.mockReset();
  });

  describe('createTag', () => {
    it('throws BadRequestException when the tag slug already exists', async () => {
      prismaMock.tag.findUnique.mockResolvedValue({ id: 'tag-1' });

      await expect(
        service.createTag({ name: 'New', slug: 'new' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.tag.create).not.toHaveBeenCalled();
    });
  });

  describe('assignTagToProduct', () => {
    it('enforces tag tier via PlansService and upserts the relation', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'product-1',
        store: { tenantId: 'tenant-1' },
      });
      prismaMock.tag.findUnique.mockResolvedValue({
        id: 'tag-1',
        slug: 'featured',
        name: 'Featured',
        tier: 2,
      });
      plansMock.assertTagTierAllowed.mockResolvedValue(undefined);
      prismaMock.productTag.upsert.mockResolvedValue({
        productId: 'product-1',
        tagId: 'tag-1',
      });

      await service.assignTagToProduct({
        tenantId: 'tenant-1',
        productId: 'product-1',
        tagId: 'tag-1',
      });

      expect(plansMock.assertTagTierAllowed).toHaveBeenCalledWith(
        'tenant-1',
        2,
      );
      expect(prismaMock.productTag.upsert).toHaveBeenCalledWith({
        where: {
          productId_tagId: { productId: 'product-1', tagId: 'tag-1' },
        },
        update: {},
        create: { productId: 'product-1', tagId: 'tag-1' },
      });
    });

    it('blocks assignment when the plan does not allow the tag tier', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'product-1',
        store: { tenantId: 'tenant-1' },
      });
      prismaMock.tag.findUnique.mockResolvedValue({
        id: 'tag-2',
        slug: 'premium',
        name: 'Premium',
        tier: 3,
      });
      plansMock.assertTagTierAllowed.mockRejectedValue(
        new ForbiddenException('Tag tier not allowed'),
      );

      await expect(
        service.assignTagToProduct({
          tenantId: 'tenant-1',
          productId: 'product-1',
          tagId: 'tag-2',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prismaMock.productTag.upsert).not.toHaveBeenCalled();
    });
  });
});
