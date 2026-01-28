import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type PlanSeed = {
  code: string;
  name: string;
  quotas: {
    maxStores: number;
    maxProductsPerStore: number;
    maxProductsTotal: number;
    maxTagTier: number;
  };
  features?: Prisma.InputJsonValue;
};

type TagSeed = {
  slug: string;
  name: string;
  tier: number;
};

const planSeeds: PlanSeed[] = [
  {
    code: 'free',
    name: 'Free',
    quotas: {
      maxStores: 1,
      maxProductsPerStore: 10,
      maxProductsTotal: 10,
      maxTagTier: 1,
    },
    features: { customDomain: false, analyticsLevel: 1 },
  },
  {
    code: 'starter',
    name: 'Starter',
    quotas: {
      maxStores: 3,
      maxProductsPerStore: 50,
      maxProductsTotal: 200,
      maxTagTier: 2,
    },
    features: { customDomain: false, analyticsLevel: 2 },
  },
  {
    code: 'pro',
    name: 'Pro',
    quotas: {
      maxStores: 10,
      maxProductsPerStore: 200,
      maxProductsTotal: 2000,
      maxTagTier: 3,
    },
    features: { customDomain: true, analyticsLevel: 3 },
  },
  {
    code: 'business',
    name: 'Business',
    quotas: {
      maxStores: 50,
      maxProductsPerStore: 500,
      maxProductsTotal: 10000,
      maxTagTier: 3,
    },
    features: { customDomain: true, analyticsLevel: 3 },
  },
];

const tagSeeds: TagSeed[] = [
  { slug: 'new', name: 'New', tier: 1 },
  { slug: 'featured', name: 'Featured', tier: 1 },
  { slug: 'sale', name: 'Sale', tier: 1 },
];

function planUpdateData(plan: PlanSeed) {
  return {
    name: plan.name,
    quotas: plan.quotas,
    ...(plan.features ? { features: plan.features } : {}),
  };
}

function planCreateData(plan: PlanSeed) {
  return {
    code: plan.code,
    name: plan.name,
    quotas: plan.quotas,
    ...(plan.features ? { features: plan.features } : {}),
  };
}

async function seedPlans() {
  console.log(`Seeding plans (${planSeeds.length})...`);
  for (const plan of planSeeds) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: planUpdateData(plan),
      create: planCreateData(plan),
    });
    console.log(`  - plan ${plan.code}`);
  }
}

async function seedTags() {
  console.log(`Seeding tags (${tagSeeds.length})...`);
  for (const tag of tagSeeds) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name, tier: tag.tier },
      create: {
        slug: tag.slug,
        name: tag.name,
        tier: tag.tier,
      },
    });
    console.log(`  - tag ${tag.slug}`);
  }
}

async function main() {
  await seedPlans();
  await seedTags();
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
