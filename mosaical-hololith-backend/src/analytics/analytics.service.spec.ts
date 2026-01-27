import { BadRequestException } from '@nestjs/common';
import { AnalyticsEventType, StoreStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../shared/prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

function createPrismaMock() {
  return {
    store: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    page: {
      findUnique: jest.fn(),
    },
    analyticsEvent: {
      upsert: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prismaMock.store.findUnique.mockReset();
    prismaMock.analyticsEvent.upsert.mockReset();
    prismaMock.analyticsEvent.create.mockReset();
  });

  describe('trackView', () => {
    it('dedupes views when viewerId and target are present', async () => {
      prismaMock.store.findUnique.mockResolvedValue({
        id: 'store-1',
        status: StoreStatus.PUBLISHED,
      });
      prismaMock.analyticsEvent.upsert.mockResolvedValue({ id: 'event-1' });

      const result = await service.trackView({
        type: AnalyticsEventType.STORE_VIEW,
        storeId: 'store-1',
        productId: undefined,
        pageId: undefined,
        viewerId: 'viewer-1',
      });

      expect(result).toEqual({ ok: true, deduped: true });

      const firstCallUnknown: unknown =
        prismaMock.analyticsEvent.upsert.mock.calls[0];
      expect(Array.isArray(firstCallUnknown)).toBe(true);
      if (!Array.isArray(firstCallUnknown)) {
        throw new Error('Expected analyticsEvent.upsert to be called');
      }

      const argsUnknown: unknown = (firstCallUnknown as unknown[])[0];
      if (!argsUnknown || typeof argsUnknown !== 'object') {
        throw new Error('Expected analyticsEvent.upsert args');
      }

      const args = argsUnknown as {
        where?: { idempotencyKey?: string };
        create?: { idempotencyKey?: string };
      };
      const idempotencyKey =
        args.where?.idempotencyKey ?? args.create?.idempotencyKey ?? '';
      const today = new Date().toISOString().slice(0, 10);

      expect(idempotencyKey).toContain('STORE_VIEW:store-1:');
      expect(idempotencyKey).toContain(`:${today}`);
    });

    it('creates a raw event when viewerId is missing', async () => {
      prismaMock.store.findUnique.mockResolvedValue({
        id: 'store-1',
        status: StoreStatus.PUBLISHED,
      });
      prismaMock.analyticsEvent.create.mockResolvedValue({ id: 'event-raw' });

      const result = await service.trackView({
        type: AnalyticsEventType.STORE_VIEW,
        storeId: 'store-1',
        productId: undefined,
        pageId: undefined,
        viewerId: undefined,
      });

      expect(result).toEqual({ ok: true, deduped: false });
      expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          type: AnalyticsEventType.STORE_VIEW,
          storeId: 'store-1',
          productId: null,
          pageId: null,
        },
      });
      expect(prismaMock.analyticsEvent.upsert).not.toHaveBeenCalled();
    });

    it('rejects invalid analytics types', async () => {
      await expect(
        service.trackView({
          type: 'INVALID' as AnalyticsEventType,
          storeId: undefined,
          productId: undefined,
          pageId: undefined,
          viewerId: undefined,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
