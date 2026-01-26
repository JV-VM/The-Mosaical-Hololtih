import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus, StoreStatus } from '@prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../shared/prisma/prisma.service';

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  // --- internal helpers ---
  private async assertStoreBelongsToTenant(storeId: string, tenantId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, tenantId: true },
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
      select: { id: true, store: { select: { tenantId: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.store.tenantId !== tenantId)
      throw new ForbiddenException('Product does not belong to this tenant');
    return product;
  }

  private async getTagOrThrow(tagId: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  private async assertTenantCanUseTag(tenantId: string, tagId: string) {
    const tag = await this.getTagOrThrow(tagId);
    await this.assertTagAllowedForTenant(tenantId, tag.tier);
    return tag;
  }

  private async deleteIfExists<T>(fn: () => Promise<T>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return;
      }

      throw error;
    }
  }

  // --- tier gating stub (hook for Task 8) ---
  // For now: allow everything. Later: enforce based on tenant plan.
  private async assertTagAllowedForTenant(tenantId: string, tagTier: number) {
    await this.plans.assertTagTierAllowed(tenantId, tagTier);
  }

  // --- public ---
  async publicListTags() {
    return this.prisma.tag.findMany({
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, tier: true, flags: true },
    });
  }

  async publicTagLanding(slug: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, tier: true, flags: true },
    });
    if (!tag) throw new NotFoundException('Tag not found');

    // Only show published stores/products
    const [stores, products] = await Promise.all([
      this.prisma.store.findMany({
        where: {
          status: StoreStatus.PUBLISHED,
          storeTags: { some: { tagId: tag.id } },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          name: true,
          subdomain: true,
          customDomain: true,
          createdAt: true,
        },
      }),
      this.prisma.product.findMany({
        where: {
          status: ProductStatus.PUBLISHED,
          productTags: { some: { tagId: tag.id } },
          store: { status: StoreStatus.PUBLISHED },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          title: true,
          priceCents: true,
          currency: true,
          media: true,
          createdAt: true,
          store: { select: { slug: true, name: true } },
        },
      }),
    ]);

    return { tag, stores, products };
  }

  // --- admin-ish (MVP seeding) ---
  async createTag(params: {
    name: string;
    slug: string;
    tier?: number;
    flags?: Prisma.InputJsonValue;
  }) {
    const existing = await this.prisma.tag.findUnique({
      where: { slug: params.slug },
    });
    if (existing) throw new BadRequestException('Tag slug already exists');

    return this.prisma.tag.create({
      data: {
        name: params.name,
        slug: params.slug,
        tier: params.tier ?? 1,
        flags: params.flags ?? undefined,
      },
      select: { id: true, slug: true, name: true, tier: true, flags: true },
    });
  }

  // --- tenant-scoped assignments ---
  async assignTagToStore(params: {
    tenantId: string;
    storeId: string;
    tagId: string;
  }) {
    await this.assertStoreBelongsToTenant(params.storeId, params.tenantId);
    await this.assertTenantCanUseTag(params.tenantId, params.tagId);

    return this.prisma.storeTag.upsert({
      where: {
        storeId_tagId: { storeId: params.storeId, tagId: params.tagId },
      },
      update: {},
      create: { storeId: params.storeId, tagId: params.tagId },
    });
  }

  async unassignTagFromStore(params: {
    tenantId: string;
    storeId: string;
    tagId: string;
  }) {
    await this.assertStoreBelongsToTenant(params.storeId, params.tenantId);

    // delete if exists; return ok either way for idempotency
    await this.deleteIfExists(() =>
      this.prisma.storeTag.delete({
        where: {
          storeId_tagId: { storeId: params.storeId, tagId: params.tagId },
        },
      }),
    );

    return { ok: true };
  }

  async assignTagToProduct(params: {
    tenantId: string;
    productId: string;
    tagId: string;
  }) {
    await this.assertProductBelongsToTenant(params.productId, params.tenantId);
    await this.assertTenantCanUseTag(params.tenantId, params.tagId);

    return this.prisma.productTag.upsert({
      where: {
        productId_tagId: { productId: params.productId, tagId: params.tagId },
      },
      update: {},
      create: { productId: params.productId, tagId: params.tagId },
    });
  }

  async unassignTagFromProduct(params: {
    tenantId: string;
    productId: string;
    tagId: string;
  }) {
    await this.assertProductBelongsToTenant(params.productId, params.tenantId);

    await this.deleteIfExists(() =>
      this.prisma.productTag.delete({
        where: {
          productId_tagId: { productId: params.productId, tagId: params.tagId },
        },
      }),
    );

    return { ok: true };
  }
}
