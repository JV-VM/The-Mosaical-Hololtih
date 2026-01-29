import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const DEBUG_E2E = process.env.DEBUG_E2E === 'true';

type DebuggableResponse = {
  statusCode?: number;
  headers?: Record<string, unknown>;
  body?: unknown;
  json?: () => unknown;
};

export const debugResponse = (res: DebuggableResponse, label: string) => {
  if (!DEBUG_E2E) return;
  let body: unknown = res.body;
  if (body === undefined && typeof res.json === 'function') {
    try {
      body = res.json();
    } catch {
      body = undefined;
    }
  }

  const payload = {
    label,
    statusCode: res.statusCode,
    headers: res.headers,
    body,
  };
  const text = JSON.stringify(payload);
  // eslint-disable-next-line no-console
  console.log(text.slice(0, 2000));
};

jest.mock('../src/shared/middleware/request-logger.middleware', () => {
  class RequestLoggerMiddleware {
    use(_req: unknown, _res: unknown, next: () => void) {
      next();
    }
  }

  return {
    RequestLoggerMiddleware,
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    },
  };
});

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
