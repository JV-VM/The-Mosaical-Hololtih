import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PageStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../shared/prisma/prisma.service';
import { PagesService } from './pages.service';

function createPrismaMock() {
  return {
    store: {
      findUnique: jest.fn(),
    },
    page: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('PagesService', () => {
  let service: PagesService;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PagesService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<PagesService>(PagesService);
    prismaMock.store.findUnique.mockReset();
    prismaMock.page.findUnique.mockReset();
    prismaMock.page.create.mockReset();
    prismaMock.page.update.mockReset();
  });

  describe('createPage', () => {
    it('rejects invalid content shapes without hitting the database create', async () => {
      prismaMock.store.findUnique.mockResolvedValue({
        id: 'store-1',
        tenantId: 'tenant-1',
        status: 'PUBLISHED',
        slug: 'store-a',
        name: 'Store A',
      });
      prismaMock.page.findUnique.mockResolvedValue(null);

      await expect(
        service.createPage({
          tenantId: 'tenant-1',
          storeId: 'store-1',
          title: 'Landing',
          slug: 'landing',
          content: { invalid: true },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.page.create).not.toHaveBeenCalled();
    });

    it('throws when the slug is already taken for the store', async () => {
      prismaMock.store.findUnique.mockResolvedValue({
        id: 'store-1',
        tenantId: 'tenant-1',
        status: 'PUBLISHED',
        slug: 'store-a',
        name: 'Store A',
      });
      prismaMock.page.findUnique.mockResolvedValue({ id: 'page-1' });

      await expect(
        service.createPage({
          tenantId: 'tenant-1',
          storeId: 'store-1',
          title: 'Landing',
          slug: 'landing',
          content: { version: 1, blocks: [] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.page.create).not.toHaveBeenCalled();
    });
  });

  describe('publishPage', () => {
    it('publishes a page when it belongs to the tenant', async () => {
      prismaMock.page.findUnique.mockResolvedValue({
        id: 'page-1',
        storeId: 'store-1',
        slug: 'landing',
        title: 'Landing',
        status: PageStatus.DRAFT,
        store: { tenantId: 'tenant-1' },
      });
      prismaMock.page.update.mockResolvedValue({
        id: 'page-1',
        status: PageStatus.PUBLISHED,
        slug: 'landing',
      });

      const result = await service.publishPage('tenant-1', 'page-1');

      expect(prismaMock.page.update).toHaveBeenCalledWith({
        where: { id: 'page-1' },
        data: { status: PageStatus.PUBLISHED },
        select: { id: true, status: true, slug: true },
      });
      expect(result).toMatchObject({ status: PageStatus.PUBLISHED });
    });
  });

  describe('updatePage', () => {
    it('throws ForbiddenException when the page belongs to another tenant', async () => {
      prismaMock.page.findUnique.mockResolvedValue({
        id: 'page-1',
        storeId: 'store-1',
        slug: 'landing',
        title: 'Landing',
        status: PageStatus.DRAFT,
        store: { tenantId: 'tenant-2' },
      });

      await expect(
        service.updatePage({
          tenantId: 'tenant-1',
          pageId: 'page-1',
          patch: { title: 'New' },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
