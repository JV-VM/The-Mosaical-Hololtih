import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
