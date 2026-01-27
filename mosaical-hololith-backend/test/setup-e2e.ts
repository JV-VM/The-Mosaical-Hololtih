import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is missing for e2e setup');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

beforeAll(async () => {
  // optional: ensure DB reachable
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await prisma.analyticsEvent.deleteMany();
  await prisma.productTag.deleteMany();
  await prisma.storeTag.deleteMany();
  await prisma.product.deleteMany();
  await prisma.page.deleteMany();
  await prisma.store.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
