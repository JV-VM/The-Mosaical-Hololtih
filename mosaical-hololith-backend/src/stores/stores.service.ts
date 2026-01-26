import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../shared/prisma/prisma.service';

const dashboardStoreSelect = {
  id: true,
  tenantId: true,
  name: true,
  slug: true,
  subdomain: true,
  customDomain: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  private async getOwnedStoreOrThrow(params: {
    tenantId: string;
    storeId: string;
  }) {
    const store = await this.prisma.store.findUnique({
      where: { id: params.storeId },
      select: { id: true, tenantId: true, slug: true, subdomain: true },
    });
    if (!store) throw new NotFoundException('Store not found');
    if (store.tenantId !== params.tenantId)
      throw new ForbiddenException('Store does not belong to this tenant');
    return store;
  }

  private async ensureUniqueSlugAndSubdomain(params: {
    slug?: string;
    subdomain?: string;
    ignoreStoreId?: string;
  }) {
    const [slugExists, subdomainExists] = await Promise.all([
      params.slug
        ? this.prisma.store.findUnique({ where: { slug: params.slug } })
        : null,
      params.subdomain
        ? this.prisma.store.findUnique({
            where: { subdomain: params.subdomain },
          })
        : null,
    ]);

    if (slugExists && slugExists.id !== params.ignoreStoreId) {
      throw new BadRequestException('Store slug already in use');
    }

    if (subdomainExists && subdomainExists.id !== params.ignoreStoreId) {
      throw new BadRequestException('Subdomain already in use');
    }
  }

  async createStore(params: {
    tenantId: string;
    name: string;
    slug: string;
    subdomain: string;
    customDomain?: string;
  }) {
    await this.plans.assertCanCreateStore(params.tenantId);
    // Basic uniqueness checks with clearer errors than raw Prisma
    await this.ensureUniqueSlugAndSubdomain({
      slug: params.slug,
      subdomain: params.subdomain,
    });

    return this.prisma.store.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        slug: params.slug,
        subdomain: params.subdomain,
        customDomain: params.customDomain ?? null,
        status: StoreStatus.DRAFT,
      },
    });
  }

  async listStoresByTenant(tenantId: string) {
    return this.prisma.store.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: dashboardStoreSelect,
    });
  }

  async updateStore(params: {
    tenantId: string;
    storeId: string;
    patch: {
      name?: string;
      slug?: string;
      subdomain?: string;
      customDomain?: string | null;
    };
  }) {
    const store = await this.getOwnedStoreOrThrow({
      tenantId: params.tenantId,
      storeId: params.storeId,
    });

    // If changing unique fields, pre-check them for friendly messages
    const nextSlug =
      params.patch.slug && params.patch.slug !== store.slug
        ? params.patch.slug
        : undefined;
    const nextSubdomain =
      params.patch.subdomain && params.patch.subdomain !== store.subdomain
        ? params.patch.subdomain
        : undefined;

    await this.ensureUniqueSlugAndSubdomain({
      slug: nextSlug,
      subdomain: nextSubdomain,
      ignoreStoreId: store.id,
    });

    return this.prisma.store.update({
      where: { id: store.id },
      data: {
        ...params.patch,
      },
      select: dashboardStoreSelect,
    });
  }

  async publishStore(tenantId: string, storeId: string) {
    await this.getOwnedStoreOrThrow({ tenantId, storeId });

    return this.prisma.store.update({
      where: { id: storeId },
      data: { status: StoreStatus.PUBLISHED },
      select: { id: true, status: true, slug: true },
    });
  }

  async unpublishStore(tenantId: string, storeId: string) {
    await this.getOwnedStoreOrThrow({ tenantId, storeId });

    return this.prisma.store.update({
      where: { id: storeId },
      data: { status: StoreStatus.DRAFT },
      select: { id: true, status: true, slug: true },
    });
  }

  async publicGetStoreBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        subdomain: true,
        customDomain: true,
        status: true,
        createdAt: true,
      },
    });

    if (!store || store.status !== StoreStatus.PUBLISHED) {
      throw new NotFoundException('Store not found');
    }

    return store;
  }
}
