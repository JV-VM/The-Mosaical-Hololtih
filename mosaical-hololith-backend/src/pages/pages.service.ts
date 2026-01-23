import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PageStatus, StoreStatus } from '@prisma/client';


function validateContentShape(content: any) {
  if (!content || typeof content !== 'object') return false;
  if (typeof content.version !== 'number') return false;
  if (!Array.isArray(content.blocks)) return false;
  return true;
}

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStoreBelongsToTenant(storeId: string, tenantId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        slug: true,
        name: true,
      },
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

  // ---- dashboard ----

  async createPage(params: {
    tenantId: string;
    storeId: string;
    title: string;
    slug: string;
    content: any;
  }) {
    await this.assertStoreBelongsToTenant(params.storeId, params.tenantId);

    if (!validateContentShape(params.content)) {
      throw new BadRequestException(
        'Invalid content shape. Expected { version:number, blocks:any[] }',
      );
    }

    const exists = await this.prisma.page.findUnique({
      where: { storeId_slug: { storeId: params.storeId, slug: params.slug } },
    });
    if (exists)
      throw new BadRequestException('Page slug already in use for this store');

    return this.prisma.page.create({
      data: {
        storeId: params.storeId,
        title: params.title,
        slug: params.slug,
        content: params.content,
        status: PageStatus.DRAFT,
      },
      select: {
        id: true,
        storeId: true,
        title: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
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
      select: {
        id: true,
        storeId: true,
        slug: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updatePage(params: {
    tenantId: string;
    pageId: string;
    patch: { title?: string; slug?: string; content?: any };
  }) {
    const page = await this.assertPageBelongsToTenant(
      params.pageId,
      params.tenantId,
    );

    if (params.patch.slug && params.patch.slug !== page.slug) {
      const exists = await this.prisma.page.findUnique({
        where: {
          storeId_slug: { storeId: page.storeId, slug: params.patch.slug },
        },
      });
      if (exists)
        throw new BadRequestException(
          'Page slug already in use for this store',
        );
    }

    if (
      params.patch.content !== undefined &&
      !validateContentShape(params.patch.content)
    ) {
      throw new BadRequestException(
        'Invalid content shape. Expected { version:number, blocks:any[] }',
      );
    }

    return this.prisma.page.update({
      where: { id: params.pageId },
      data: {
        title: params.patch.title,
        slug: params.patch.slug,
        content: params.patch.content,
      },
      select: {
        id: true,
        storeId: true,
        slug: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
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
    const store = await this.prisma.store.findUnique({
      where: { slug: params.storeSlug },
      select: { id: true, status: true, slug: true, name: true },
    });

    if (!store || store.status !== StoreStatus.PUBLISHED) {
      throw new NotFoundException('Store not found');
    }

    const page = await this.prisma.page.findUnique({
      where: { storeId_slug: { storeId: store.id, slug: params.pageSlug } },
      select: {
        id: true,
        slug: true,
        title: true,
        content: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!page || page.status !== PageStatus.PUBLISHED) {
      throw new NotFoundException('Page not found');
    }

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
