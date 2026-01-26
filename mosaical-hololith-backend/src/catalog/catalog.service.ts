import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus, StoreStatus } from '@prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../shared/prisma/prisma.service';

type CreateProductParams = {
  tenantId: string;
  storeId: string;
  title: string;
  slug: string;
  description?: string;
  priceCents: number;
  currency?: string;
  media?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

type UpdateProductParams = {
  tenantId: string;
  productId: string;
  patch: {
    title?: string;
    slug?: string;
    description?: string | null;
    priceCents?: number;
    currency?: string;
    media?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  };
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  // ---- reusable selects ----

  private static readonly productDashboardSelect: Prisma.ProductSelect = {
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
  };

  private static readonly productListSelect: Prisma.ProductSelect = {
    id: true,
    storeId: true,
    title: true,
    slug: true,
    priceCents: true,
    currency: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  };

  private static readonly publicProductSelect: Prisma.ProductSelect = {
    id: true,
    slug: true,
    title: true,
    description: true,
    priceCents: true,
    currency: true,
    media: true,
    status: true,
    createdAt: true,
  };

  private static readonly publicProductListSelect: Prisma.ProductSelect = {
    id: true,
    slug: true,
    title: true,
    description: true,
    priceCents: true,
    currency: true,
    media: true,
    createdAt: true,
  };

  private static readonly productStatusByAction = {
    publish: ProductStatus.PUBLISHED,
    unpublish: ProductStatus.DRAFT,
  } as const;

  private static readonly productStatusSelect = {
    id: true,
    status: true,
    slug: true,
  };

  // ---- helpers ----

  private async assertStoreBelongsToTenant(storeId: string, tenantId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, tenantId: true, status: true, slug: true },
    });

    if (!store) throw new NotFoundException('Store not found');
    if (store.tenantId !== tenantId) {
      throw new ForbiddenException('Store does not belong to this tenant');
    }

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
    if (product.store.tenantId !== tenantId) {
      throw new ForbiddenException('Product does not belong to this tenant');
    }

    return product;
  }

  private async assertProductSlugUniqueInStore(storeId: string, slug: string) {
    const exists = await this.prisma.product.findUnique({
      where: { storeId_slug: { storeId, slug } },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException(
        'Product slug already in use for this store',
      );
    }
  }

  private toNullableStringPatch(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined) return undefined;
    return value ?? null;
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

  // ---- dashboard endpoints ----

  async createProduct(params: CreateProductParams) {
    await this.plans.assertCanCreateProduct(params.tenantId, params.storeId);
    await this.assertProductSlugUniqueInStore(params.storeId, params.slug);

    return this.prisma.product.create({
      data: {
        storeId: params.storeId,
        title: params.title,
        slug: params.slug,
        description: params.description ?? null,
        priceCents: params.priceCents,
        currency: params.currency ?? 'USD',
        media: params.media,
        status: ProductStatus.DRAFT,
      },
      select: CatalogService.productDashboardSelect,
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
      select: CatalogService.productListSelect,
    });
  }

  async updateProduct(params: UpdateProductParams) {
    const product = await this.assertProductBelongsToTenant(
      params.productId,
      params.tenantId,
    );

    if (params.patch.slug && params.patch.slug !== product.slug) {
      await this.assertProductSlugUniqueInStore(
        product.storeId,
        params.patch.slug,
      );
    }

    return this.prisma.product.update({
      where: { id: params.productId },
      data: {
        ...params.patch,
        description: this.toNullableStringPatch(params.patch.description),
      },
      select: CatalogService.productDashboardSelect,
    });
  }

  async publishProduct(tenantId: string, productId: string) {
    return this.updateProductStatus(tenantId, productId, 'publish');
  }

  async unpublishProduct(tenantId: string, productId: string) {
    return this.updateProductStatus(tenantId, productId, 'unpublish');
  }

  private async updateProductStatus(
    tenantId: string,
    productId: string,
    action: keyof typeof CatalogService.productStatusByAction,
  ) {
    await this.assertProductBelongsToTenant(productId, tenantId);
    const status = CatalogService.productStatusByAction[action];
    return this.prisma.product.update({
      where: { id: productId },
      data: { status },
      select: CatalogService.productStatusSelect,
    });
  }

  // ---- public endpoints ----

  async publicListProductsByStoreSlug(storeSlug: string) {
    const store = await this.getPublishedStoreBySlug(storeSlug);

    const products = await this.prisma.product.findMany({
      where: {
        storeId: store.id,
        status: ProductStatus.PUBLISHED,
      },
      orderBy: { createdAt: 'desc' },
      select: CatalogService.publicProductListSelect,
    });

    return {
      store: { slug: store.slug, name: store.name },
      products,
    };
  }

  async publicGetProductByStoreSlug(storeSlug: string, productSlug: string) {
    const store = await this.getPublishedStoreBySlug(storeSlug);

    const product = await this.prisma.product.findUnique({
      where: {
        storeId_slug: { storeId: store.id, slug: productSlug },
      },
      select: CatalogService.publicProductSelect,
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
