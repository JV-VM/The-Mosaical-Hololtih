import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { ProductStatus, StoreStatus } from '@prisma/client';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  // ---- helpers ----
  private async assertStoreBelongsToTenant(storeId: string, tenantId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, tenantId: true, status: true, slug: true },
    });
    if (!store) throw new NotFoundException('Store not found');
    if (store.tenantId !== tenantId)
      throw new ForbiddenException('Store does not belong to this tenant');
    return store;
  }

  private async assertProductBelongsToTenant(
    productId: string,
    tenantId: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        storeId: true,
        status: true,
        slug: true,
        store: { select: { tenantId: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.store.tenantId !== tenantId)
      throw new ForbiddenException('Product does not belong to this tenant');
    return product;
  }

  // ---- dashboard endpoints ----

  async createProduct(params: {
    tenantId: string;
    storeId: string;
    title: string;
    slug: string;
    description?: string;
    priceCents: number;
    currency?: string;
    media?: any;
  }) {
    await this.plans.assertCanCreateProduct(params.tenantId, params.storeId);
    // Friendly uniqueness check
    const exists = await this.prisma.product.findUnique({
      where: { storeId_slug: { storeId: params.storeId, slug: params.slug } },
    });
    if (exists)
      throw new BadRequestException(
        'Product slug already in use for this store',
      );

    return this.prisma.product.create({
      data: {
        storeId: params.storeId,
        title: params.title,
        slug: params.slug,
        description: params.description ?? null,
        priceCents: params.priceCents,
        currency: params.currency ?? 'USD',
        media: params.media ?? undefined,
        status: ProductStatus.DRAFT,
      },
      select: {
        id: true,
        storeId: true,
        title: true,
        slug: true,
        description: true,
        priceCents: true,
        currency: true,
        status: true,
        media: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async listProducts(params: { tenantId: string; storeId?: string }) {
    if (params.storeId) {
      await this.assertStoreBelongsToTenant(params.storeId, params.tenantId);
    }

    return this.prisma.product.findMany({
      where: {
        ...(params.storeId ? { storeId: params.storeId } : {}),
        store: { tenantId: params.tenantId },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        storeId: true,
        title: true,
        slug: true,
        priceCents: true,
        currency: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateProduct(params: {
    tenantId: string;
    productId: string;
    patch: {
      title?: string;
      slug?: string;
      description?: string;
      priceCents?: number;
      currency?: string;
      media?: any;
    };
  }) {
    const product = await this.assertProductBelongsToTenant(
      params.productId,
      params.tenantId,
    );

    if (params.patch.slug && params.patch.slug !== product.slug) {
      const exists = await this.prisma.product.findUnique({
        where: {
          storeId_slug: { storeId: product.storeId, slug: params.patch.slug },
        },
      });
      if (exists)
        throw new BadRequestException(
          'Product slug already in use for this store',
        );
    }

    return this.prisma.product.update({
      where: { id: params.productId },
      data: {
        ...params.patch,
        description:
          params.patch.description === undefined
            ? undefined
            : (params.patch.description ?? null),
      },
      select: {
        id: true,
        storeId: true,
        title: true,
        slug: true,
        description: true,
        priceCents: true,
        currency: true,
        status: true,
        media: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async publishProduct(tenantId: string, productId: string) {
    await this.assertProductBelongsToTenant(productId, tenantId);

    return this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.PUBLISHED },
      select: { id: true, status: true, slug: true },
    });
  }

  async unpublishProduct(tenantId: string, productId: string) {
    await this.assertProductBelongsToTenant(productId, tenantId);

    return this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.DRAFT },
      select: { id: true, status: true, slug: true },
    });
  }

  // ---- public endpoints ----

  async publicListProductsByStoreSlug(storeSlug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, status: true, slug: true, name: true },
    });

    if (!store || store.status !== StoreStatus.PUBLISHED) {
      throw new NotFoundException('Store not found');
    }

    const products = await this.prisma.product.findMany({
      where: {
        storeId: store.id,
        status: ProductStatus.PUBLISHED,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        media: true,
        createdAt: true,
      },
    });

    return {
      store: { slug: store.slug, name: store.name },
      products,
    };
  }

  async publicGetProductByStoreSlug(storeSlug: string, productSlug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, status: true, slug: true, name: true },
    });

    if (!store || store.status !== StoreStatus.PUBLISHED) {
      throw new NotFoundException('Store not found');
    }

    const product = await this.prisma.product.findUnique({
      where: {
        storeId_slug: { storeId: store.id, slug: productSlug },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        media: true,
        status: true,
        createdAt: true,
      },
    });

    if (!product || product.status !== ProductStatus.PUBLISHED) {
      throw new NotFoundException('Product not found');
    }

    return {
      store: { slug: store.slug, name: store.name },
      product,
    };
  }
}
