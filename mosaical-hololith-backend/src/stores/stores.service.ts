import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PlansService } from '../plans/plans.service';

import { StoreStatus } from '@prisma/client';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async createStore(params: {
    tenantId: string;
    name: string;
    slug: string;
    subdomain: string;
    customDomain?: string;
  }) {
    await this.plans.assertCanCreateStore(params.tenantId);
    // Basic uniqueness checks with clearer errors than raw Prisma
    const [slugExists, subdomainExists] = await Promise.all([
      this.prisma.store.findUnique({ where: { slug: params.slug } }),
      this.prisma.store.findUnique({ where: { subdomain: params.subdomain } }),
    ]);

    if (slugExists) throw new BadRequestException('Store slug already in use');
    if (subdomainExists)
      throw new BadRequestException('Subdomain already in use');

    return this.prisma.store.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        slug: params.slug,
        subdomain: params.subdomain,
        customDomain: params.customDomain ?? null,
        status: 'DRAFT',
      },
    });
  }

  async listStoresByTenant(tenantId: string) {
    return this.prisma.store.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        name: true,
        slug: true,
        subdomain: true,
        customDomain: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
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
    const store = await this.prisma.store.findUnique({
      where: { id: params.storeId },
    });
    if (!store) throw new NotFoundException('Store not found');
    if (store.tenantId !== params.tenantId)
      throw new ForbiddenException('Store does not belong to this tenant');

    // If changing unique fields, pre-check them for friendly messages
    if (params.patch.slug && params.patch.slug !== store.slug) {
      const exists = await this.prisma.store.findUnique({
        where: { slug: params.patch.slug },
      });
      if (exists) throw new BadRequestException('Store slug already in use');
    }
    if (params.patch.subdomain && params.patch.subdomain !== store.subdomain) {
      const exists = await this.prisma.store.findUnique({
        where: { subdomain: params.patch.subdomain },
      });
      if (exists) throw new BadRequestException('Subdomain already in use');
    }

    return this.prisma.store.update({
      where: { id: store.id },
      data: {
        ...params.patch,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        slug: true,
        subdomain: true,
        customDomain: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async publishStore(tenantId: string, storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store not found');
    if (store.tenantId !== tenantId)
      throw new ForbiddenException('Store does not belong to this tenant');

    return this.prisma.store.update({
      where: { id: storeId },
      data: { status: StoreStatus.PUBLISHED },
      select: { id: true, status: true, slug: true },
    });
  }

  async unpublishStore(tenantId: string, storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store not found');
    if (store.tenantId !== tenantId)
      throw new ForbiddenException('Store does not belong to this tenant');

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

    if (!store || store.status !== 'PUBLISHED') {
      throw new NotFoundException('Store not found');
    }

    return store;
  }
}
