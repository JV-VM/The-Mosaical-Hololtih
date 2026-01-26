import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import {
  AnalyticsEventType,
  ProductStatus,
  StoreStatus,
  PageStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
interface InputView {
  type: AnalyticsEventType;
  storeId: string | undefined;
  productId: string | undefined;
  pageId: string | undefined;
  viewerId: string | undefined;
}
type Product = {
  id: string;
  status: ProductStatus;
  store: {
    status: StoreStatus;
  };
} | null;

type Page = {
  id: string;
  status: PageStatus;
  store: {
    status: StoreStatus;
  };
} | null;
type Day = {
  date: string;
  storeViews: number;
  productViews: number;
  pageViews: number;
};
type EventType = { createdAt: Date; type: AnalyticsEventType };

type ViewerHashType = string | null;

const TENANT_WHERE_BY_TYPE = {
  STORE_VIEW: (tenantId: string) => ({ store: { tenantId } }),
  PRODUCT_VIEW: (tenantId: string) => ({ product: { store: { tenantId } } }),
  PAGE_VIEW: (tenantId: string) => ({ page: { store: { tenantId } } }),
} as const;

type ViewEventType = keyof typeof TENANT_WHERE_BY_TYPE;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private basicValidationOfViews(input: InputView): void {
    if (!(input.type in TENANT_WHERE_BY_TYPE))
      throw new BadRequestException('Invalid analytics view type');
    if (input.type === 'STORE_VIEW' && !input.storeId)
      throw new BadRequestException('storeId is required for STORE_VIEW');

    if (input.type === 'PRODUCT_VIEW' && !input.productId)
      throw new BadRequestException('productId is required for PRODUCT_VIEW');

    if (input.type === 'PAGE_VIEW' && !input.pageId)
      throw new BadRequestException('pageId is required for PAGE_VIEW');
  }

  private async isStoreViewEvent(input: InputView) {
    if (input.type !== 'STORE_VIEW') return;
    const store = await this.prisma.store.findUnique({
      where: { id: input.storeId },
      select: { id: true, status: true },
    });
    if (!store || store.status !== StoreStatus.PUBLISHED)
      throw new NotFoundException('Store not found');
  }

  private assertProduct(product: Product) {
    const noProduct = !product;
    const productIsNotPublished = product?.status !== ProductStatus.PUBLISHED;
    const productStoreIsNotPublished =
      product?.store.status !== StoreStatus.PUBLISHED;
    if (noProduct || productIsNotPublished || productStoreIsNotPublished)
      throw new NotFoundException('Product not found');
  }

  private async isProductViewEvent(input: InputView) {
    if (input.type !== 'PRODUCT_VIEW') return;
    const product: Product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true, status: true, store: { select: { status: true } } },
    });
    this.assertProduct(product);
  }

  private assertPage(page: Page) {
    const noPage = !page;
    const pageIsNotPublished = page?.status !== PageStatus.PUBLISHED;
    const pageStoreIsNotPublished =
      page?.store.status !== StoreStatus.PUBLISHED;
    if (noPage || pageIsNotPublished || pageStoreIsNotPublished)
      throw new NotFoundException('Page not found');
  }

  private async isPageViewEvent(input: InputView) {
    if (input.type !== 'PAGE_VIEW') return;

    const page = await this.prisma.page.findUnique({
      where: { id: input.pageId },
      select: { id: true, status: true, store: { select: { status: true } } },
    });
    this.assertPage(page);
  }
  private async ensurePublishedContent(input: InputView) {
    await this.isStoreViewEvent(input);
    await this.isProductViewEvent(input);
    await this.isPageViewEvent(input);
  }
  private ensureHashViewer(input: InputView) {
    if (input.viewerId) return hashViewer(input.viewerId);
    return null;
  }
  private resolveTargetKey(input: InputView): string | null | undefined {
    switch (input.type) {
      case 'STORE_VIEW':
        return input.storeId;
      case 'PRODUCT_VIEW':
        return input.productId;
      case 'PAGE_VIEW':
        return input.pageId;
      default:
        return null;
    }
  }
  private getIdempotencyKey(
    input: InputView,
    viewerHash: string,
    day: string,
    targetId: string,
  ): string {
    return `${input.type}:${targetId}:${viewerHash}:${day}`;
  }
  private async assertEvent(
    idempotencyKey: string,
    input: InputView,
    viewerHash: string,
  ) {
    await this.prisma.analyticsEvent.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        type: input.type,
        storeId: input.storeId ?? null,
        productId: input.productId ?? null,
        pageId: input.pageId ?? null,
        viewerHash,
        idempotencyKey,
      },
    });
  }
  private async createARawEvent(input: InputView) {
    await this.prisma.analyticsEvent.create({
      data: {
        type: input.type,
        storeId: input.storeId ?? null,
        productId: input.productId ?? null,
        pageId: input.pageId ?? null,
      },
    });
  }
  async trackView(input: InputView) {
    const now = new Date();
    const day = dayKeyUTC(now);

    this.basicValidationOfViews(input);
    await this.ensurePublishedContent(input);

    const viewerHash: ViewerHashType = this.ensureHashViewer(input);
    const targetId: string | null | undefined = this.resolveTargetKey(input);
    if (!viewerHash || !targetId) {
      await this.createARawEvent(input);
      return { ok: true, deduped: false };
    }
    const idempotencyKey = this.getIdempotencyKey(
      input,
      viewerHash,
      day,
      targetId,
    );
    await this.assertEvent(idempotencyKey, input, viewerHash);
    return { ok: true, deduped: true };
  }

  private countViews(tenantId: string, type: ViewEventType, start?: Date) {
    const tenantWhere = TENANT_WHERE_BY_TYPE[type](tenantId);
    return this.prisma.analyticsEvent.count({
      where: {
        type,
        ...(start ? { createdAt: { gte: start } } : {}),
        ...tenantWhere,
      },
    });
  }

  private getStoreViews(tenantId: string) {
    return this.countViews(tenantId, 'STORE_VIEW');
  }
  private getProductViews(tenantId: string) {
    return this.countViews(tenantId, 'PRODUCT_VIEW');
  }
  private getPageViews(tenantId: string) {
    return this.countViews(tenantId, 'PAGE_VIEW');
  }

  async assertDashboardOverview(tenantId: string) {
    const [storeViews, productViews, pageViews] = await Promise.all([
      this.getStoreViews(tenantId),
      this.getProductViews(tenantId),
      this.getPageViews(tenantId),
    ]);
    return {
      totals: {
        storeViews,
        productViews,
        pageViews,
      },
    };
  }

  private getLastWeekDate() {
    const now = new Date();
    const today = startOfDay(now);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 6);
    return start;
  }
  private async fetchLastWeekEvents(tenantId: string, start: Date) {
    const types = Object.keys(TENANT_WHERE_BY_TYPE) as ViewEventType[];
    const orFilters = types.map((type) => ({
      type,
      ...TENANT_WHERE_BY_TYPE[type](tenantId),
    }));
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        createdAt: { gte: start },
        OR: orFilters,
      },
      select: { type: true, createdAt: true },
    });
    return events;
  }
  private buildLastWeekBuckets(start: Date, days: Day[]) {
    for (let i = 0; i < 7; i++) {
      const firstDay = new Date(start);

      firstDay.setUTCDate(start.getUTCDate() + i);

      const key = firstDay.toISOString().slice(0, 10);

      days.push({ date: key, storeViews: 0, productViews: 0, pageViews: 0 });
    }
  }
  private accumulateViewsByDate(
    events: EventType[],
    mapByDate: Map<string, Day>,
  ) {
    for (const event of events) {
      const key = event.createdAt.toISOString().slice(0, 10);
      const bucket = mapByDate.get(key);
      if (!bucket) continue;
      if (event.type === 'STORE_VIEW') bucket.storeViews += 1;
      if (event.type === 'PRODUCT_VIEW') bucket.productViews += 1;
      if (event.type === 'PAGE_VIEW') bucket.pageViews += 1;
    }
  }
  async last7Days(tenantId: string) {
    const start = this.getLastWeekDate();
    const events = await this.fetchLastWeekEvents(tenantId, start);
    const days: Day[] = [];
    this.buildLastWeekBuckets(start, days);
    const mapByDate = new Map(days.map((x) => [x.date, x]));
    this.accumulateViewsByDate(events, mapByDate);
    return { start: start.toISOString().slice(0, 10), days };
  }

  private getStoreViewsByDate(tenantId: string, start: Date) {
    return this.countViews(tenantId, 'STORE_VIEW', start);
  }
  private getProductViewsByDate(tenantId: string, start: Date) {
    return this.countViews(tenantId, 'PRODUCT_VIEW', start);
  }
  private getPageViewsByDate(tenantId: string, start: Date) {
    return this.countViews(tenantId, 'PAGE_VIEW', start);
  }

  // Optional: store-level analytics for dashboard screens
  async storeStats(tenantId: string, storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, tenantId: true },
    });
    const noStore = !store;
    const notBelongToTenant = store?.tenantId !== tenantId;
    if (noStore) throw new NotFoundException('Store not found');
    if (notBelongToTenant)
      throw new ForbiddenException('Store does not belong to this tenant');
    const start = this.getLastWeekDate();
    const storeViews = await this.prisma.analyticsEvent.count({
      where: {
        createdAt: { gte: start },
        type: 'STORE_VIEW',
        storeId,
        store: { tenantId },
      },
    });
    const productViews = await this.prisma.analyticsEvent.count({
      where: {
        createdAt: { gte: start },
        type: 'PRODUCT_VIEW',
        product: { storeId, store: { tenantId } },
      },
    });
    const pageViews = await this.prisma.analyticsEvent.count({
      where: {
        createdAt: { gte: start },
        type: 'PAGE_VIEW',
        page: { storeId, store: { tenantId } },
      },
    });

    return { storeId, totals: { storeViews, productViews, pageViews } };
  }
}
function dayKeyUTC(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function hashViewer(viewerId: string) {
  return createHash('sha256').update(viewerId).digest('hex');
}

function startOfDay(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
