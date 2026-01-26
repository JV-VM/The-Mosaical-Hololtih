import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';

export type Quotas = {
  maxStores: number; // per tenant
  maxProductsPerStore: number; // per store
  maxProductsTotal?: number; // optional per tenant
  maxTagTier: number; // 1=A, 2=B, 3=C
};

type PlanFeatures = Prisma.InputJsonValue;

const DEFAULT_FREE_PLAN: {
  code: string;
  name: string;
  quotas: Quotas;
  features?: PlanFeatures;
} = {
  code: 'free',
  name: 'Free',
  quotas: {
    maxStores: 1,
    maxProductsPerStore: 10,
    maxProductsTotal: 10,
    maxTagTier: 1,
  },
  features: { customDomain: false, analyticsLevel: 1 },
};

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  private formatLimitMessage(
    params:
      | { kind: 'maxStores'; value: number }
      | { kind: 'maxProductsPerStore'; value: number }
      | { kind: 'maxProductsTotal'; value: number }
      | { kind: 'maxTagTier'; tagTier: number; maxTagTier: number },
  ) {
    if (params.kind === 'maxStores') {
      return `Plan limit reached: maxStores=${params.value}. Upgrade required.`;
    }

    if (params.kind === 'maxProductsPerStore') {
      return `Plan limit reached: maxProductsPerStore=${params.value}. Upgrade required.`;
    }

    if (params.kind === 'maxProductsTotal') {
      return `Plan limit reached: maxProductsTotal=${params.value}. Upgrade required.`;
    }

    return `Tag tier not allowed by plan. tagTier=${params.tagTier}, maxTagTier=${params.maxTagTier}.`;
  }

  // Ensure Free plan exists + tenant has subscription
  async ensureTenantSubscription(tenantId: string) {
    const plan = await this.prisma.plan.upsert({
      where: { code: DEFAULT_FREE_PLAN.code },
      update: {},
      create: {
        code: DEFAULT_FREE_PLAN.code,
        name: DEFAULT_FREE_PLAN.name,
        quotas: DEFAULT_FREE_PLAN.quotas,
        features: DEFAULT_FREE_PLAN.features,
      },
    });

    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (sub) return sub;

    return this.prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: 'ACTIVE',
      },
      include: { plan: true },
    });
  }

  async getTenantPlan(tenantId: string) {
    const sub = await this.ensureTenantSubscription(tenantId);

    if (!sub?.plan) {
      throw new BadRequestException('Subscription/plan missing');
    }

    return {
      subscription: { id: sub.id, status: sub.status },
      plan: {
        id: sub.plan.id,
        code: sub.plan.code,
        name: sub.plan.name,
        quotas: sub.plan.quotas as Quotas,
        features: (sub.plan.features as PlanFeatures) ?? {},
      },
    };
  }

  async computeUsage(tenantId: string, quotas?: Quotas) {
    const [storeCount, productsTotal] = await Promise.all([
      this.prisma.store.count({ where: { tenantId } }),
      this.prisma.product.count({ where: { store: { tenantId } } }),
    ]);

    // Only compute per-store usage when needed (for store-scoped endpoints)
    return {
      stores: storeCount,
      productsTotal,
      quotas,
    };
  }

  // -------------------
  // ENFORCEMENT HELPERS
  // -------------------

  async assertCanCreateStore(tenantId: string) {
    const { plan } = await this.getTenantPlan(tenantId);
    const usage = await this.computeUsage(tenantId, plan.quotas);

    if (usage.stores >= plan.quotas.maxStores) {
      throw new ForbiddenException(
        this.formatLimitMessage({
          kind: 'maxStores',
          value: plan.quotas.maxStores,
        }),
      );
    }
  }

  async assertCanCreateProduct(tenantId: string, storeId: string) {
    const { plan } = await this.getTenantPlan(tenantId);

    const [perStoreCount, totalCount] = await Promise.all([
      this.prisma.product.count({ where: { storeId } }),
      this.prisma.product.count({ where: { store: { tenantId } } }),
    ]);

    if (perStoreCount >= plan.quotas.maxProductsPerStore) {
      throw new ForbiddenException(
        this.formatLimitMessage({
          kind: 'maxProductsPerStore',
          value: plan.quotas.maxProductsPerStore,
        }),
      );
    }

    if (
      typeof plan.quotas.maxProductsTotal === 'number' &&
      totalCount >= plan.quotas.maxProductsTotal
    ) {
      throw new ForbiddenException(
        this.formatLimitMessage({
          kind: 'maxProductsTotal',
          value: plan.quotas.maxProductsTotal,
        }),
      );
    }
  }

  async assertTagTierAllowed(tenantId: string, tagTier: number) {
    const { plan } = await this.getTenantPlan(tenantId);
    if (tagTier > plan.quotas.maxTagTier) {
      throw new ForbiddenException(
        this.formatLimitMessage({
          kind: 'maxTagTier',
          tagTier,
          maxTagTier: plan.quotas.maxTagTier,
        }),
      );
    }
  }

  // -------------------
  // MVP UPGRADE (NO PAYMENTS)
  // -------------------

  async upsertPlan(input: {
    code: string;
    name: string;
    quotas: Quotas;
    features?: PlanFeatures;
  }) {
    return this.prisma.plan.upsert({
      where: { code: input.code },
      update: {
        name: input.name,
        quotas: input.quotas,
        features: input.features ?? {},
      },
      create: {
        code: input.code,
        name: input.name,
        quotas: input.quotas,
        features: input.features ?? {},
      },
    });
  }

  async setTenantPlan(tenantId: string, planCode: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { code: planCode },
    });
    if (!plan) throw new BadRequestException(`Plan not found: ${planCode}`);

    await this.ensureTenantSubscription(tenantId);

    return this.prisma.subscription.update({
      where: { tenantId },
      data: { planId: plan.id, status: 'ACTIVE' },
      include: { plan: true },
    });
  }
}
