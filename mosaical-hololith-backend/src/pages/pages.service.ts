import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PageStatus, Prisma, StoreStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { assertValidContent } from './page-content';

const pageSelect = {
  id: true,
  storeId: true,
  slug: true,
  title: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const publicPageSelect = {
  id: true,
  slug: true,
  title: true,
  content: true,
  status: true,
  updatedAt: true,
} as const;

const storeSelect = {
  id: true,
  tenantId: true,
  status: true,
  slug: true,
  name: true,
} as const;

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureSlugAvailableForStore(params: {
    storeId: string;
    slug: string;
  }) {
    const exists = await this.prisma.page.findUnique({
      where: { storeId_slug: { storeId: params.storeId, slug: params.slug } },
    });
    if (exists)
      throw new BadRequestException('Page slug already in use for this store');
  }

  private async assertStoreBelongsToTenant(storeId: string, tenantId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: storeSelect,
    });
    if (!store) throw new NotFoundException('Store not found');
    if (store.tenantId !== tenantId)
      throw new ForbiddenException('Store does not belong to this tenant');
    return store;
  }

  private async assertPageBelongsToTenant(pageId: string, tenantId: string) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        storeId: true,
        slug: true,
        title: true,
        status: true,
        store: { select: { tenantId: true } },
      },
    });
    if (!page) throw new NotFoundException('Page not found');
    if (page.store.tenantId !== tenantId)
      throw new ForbiddenException('Page does not belong to this tenant');
    return page;
  }

  private async getPublishedStoreBySlug(storeSlug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, status: true, slug: true, name: true },
    });

    if (!store || store.status !== StoreStatus.PUBLISHED) {
      throw new NotFoundException('Store not found');
    }

    return store;
  }

  private async getPublishedPageForStore(params: {
    storeId: string;
    pageSlug: string;
  }) {
    const page = await this.prisma.page.findFirst({
      where: {
        storeId: params.storeId,
        slug: params.pageSlug,
        status: PageStatus.PUBLISHED,
      },
      select: publicPageSelect,
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    return page;
  }

  // ---- dashboard ----

  async createPage(params: {
    tenantId: string;
    storeId: string;
    title: string;
    slug: string;
    content: unknown;
  }) {
    await this.assertStoreBelongsToTenant(params.storeId, params.tenantId);

    assertValidContent(params.content);

    await this.ensureSlugAvailableForStore({
      storeId: params.storeId,
      slug: params.slug,
    });

    const persistenceContent = params.content as Prisma.InputJsonValue;

    return this.prisma.page.create({
      data: {
        storeId: params.storeId,
        title: params.title,
        slug: params.slug,
        content: persistenceContent,
        status: PageStatus.DRAFT,
      },
      select: pageSelect,
    });
  }

  async listPages(params: { tenantId: string; storeId?: string }) {
    if (params.storeId)
      await this.assertStoreBelongsToTenant(params.storeId, params.tenantId);

    return this.prisma.page.findMany({
      where: {
        ...(params.storeId ? { storeId: params.storeId } : {}),
        store: { tenantId: params.tenantId },
      },
      orderBy: { createdAt: 'desc' },
      select: pageSelect,
    });
  }

  async updatePage(params: {
    tenantId: string;
    pageId: string;
    patch: { title?: string; slug?: string; content?: unknown };
  }) {
    const page = await this.assertPageBelongsToTenant(
      params.pageId,
      params.tenantId,
    );

    if (params.patch.slug && params.patch.slug !== page.slug) {
      await this.ensureSlugAvailableForStore({
        storeId: page.storeId,
        slug: params.patch.slug,
      });
    }

    if (params.patch.content !== undefined) {
      assertValidContent(params.patch.content);
    }

    const persistenceContent: Prisma.InputJsonValue | undefined =
      params.patch.content === undefined
        ? undefined
        : (params.patch.content as Prisma.InputJsonValue);

    return this.prisma.page.update({
      where: { id: params.pageId },
      data: {
        title: params.patch.title,
        slug: params.patch.slug,
        content: persistenceContent,
      },
      select: pageSelect,
    });
  }

  async publishPage(tenantId: string, pageId: string) {
    await this.assertPageBelongsToTenant(pageId, tenantId);

    return this.prisma.page.update({
      where: { id: pageId },
      data: { status: PageStatus.PUBLISHED },
      select: { id: true, status: true, slug: true },
    });
  }

  async unpublishPage(tenantId: string, pageId: string) {
    await this.assertPageBelongsToTenant(pageId, tenantId);

    return this.prisma.page.update({
      where: { id: pageId },
      data: { status: PageStatus.DRAFT },
      select: { id: true, status: true, slug: true },
    });
  }

  // ---- public ----

  async publicGetPageBySlug(params: { storeSlug: string; pageSlug: string }) {
    const store = await this.getPublishedStoreBySlug(params.storeSlug);
    const page = await this.getPublishedPageForStore({
      storeId: store.id,
      pageSlug: params.pageSlug,
    });

    return {
      store: { slug: store.slug, name: store.name },
      page: {
        slug: page.slug,
        title: page.title,
        content: page.content,
        updatedAt: page.updatedAt,
      },
    };
  }
}
