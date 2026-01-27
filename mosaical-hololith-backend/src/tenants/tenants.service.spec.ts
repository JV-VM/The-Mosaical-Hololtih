import { MemberRole } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../shared/prisma/prisma.service';
import { TenantsService } from './tenants.service';

type MembershipRecord = {
  id: string;
  role: MemberRole;
  tenant: { id: string; name: string; ownerId: string };
};

function createPrismaMock() {
  return {
    tenant: {
      create: jest.fn(),
    },
    membership: {
      findMany: jest.fn(),
    },
  };
}

describe('TenantsService', () => {
  let service: TenantsService;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    prismaMock.tenant.create.mockReset();
    prismaMock.membership.findMany.mockReset();
  });

  describe('createTenant', () => {
    it('creates the tenant and assigns TENANT_ADMIN to the owner', async () => {
      prismaMock.tenant.create.mockResolvedValue({ id: 'tenant-1' });

      await service.createTenant({ name: 'Tenant', ownerId: 'user-1' });

      const firstCallUnknown: unknown = prismaMock.tenant.create.mock.calls[0];
      expect(Array.isArray(firstCallUnknown)).toBe(true);
      if (!Array.isArray(firstCallUnknown)) {
        throw new Error('Expected prisma.tenant.create to be called');
      }

      const createArgsUnknown: unknown = (firstCallUnknown as unknown[])[0];
      if (!createArgsUnknown || typeof createArgsUnknown !== 'object') {
        throw new Error('Expected prisma.tenant.create to be called with args');
      }

      const createArgs = createArgsUnknown as {
        data: {
          name?: unknown;
          ownerId?: unknown;
          members?: { create?: { userId?: unknown; role?: unknown } };
        };
        include?: unknown;
      };

      expect(createArgs.data.name).toBe('Tenant');
      expect(createArgs.data.ownerId).toBe('user-1');
      expect(createArgs.data.members?.create?.userId).toBe('user-1');
      expect(createArgs.data.members?.create?.role).toBe(
        MemberRole.TENANT_ADMIN,
      );
      expect(createArgs.include).toEqual({ members: true });
    });
  });

  describe('listMyTenants', () => {
    it('queries memberships scoped by userId with stable select/orderBy', async () => {
      prismaMock.membership.findMany.mockResolvedValue([]);

      await service.listMyTenants('user-1');

      const firstCallUnknown: unknown =
        prismaMock.membership.findMany.mock.calls[0];
      expect(Array.isArray(firstCallUnknown)).toBe(true);
      if (!Array.isArray(firstCallUnknown)) {
        throw new Error('Expected prisma.membership.findMany to be called');
      }

      const argsUnknown: unknown = (firstCallUnknown as unknown[])[0];
      if (!argsUnknown || typeof argsUnknown !== 'object') {
        throw new Error('Expected prisma.membership.findMany args');
      }

      const args = argsUnknown as {
        where?: unknown;
        select?: unknown;
        orderBy?: unknown;
      };

      expect(args.where).toEqual({ userId: 'user-1' });
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
      expect(args.select).toMatchObject({
        id: true,
        role: true,
        tenant: {
          select: { id: true, name: true, ownerId: true },
        },
      });
    });

    it('maps memberships into a stable response shape', async () => {
      const memberships: MembershipRecord[] = [
        {
          id: 'membership-1',
          role: MemberRole.TENANT_ADMIN,
          tenant: { id: 'tenant-1', name: 'Tenant', ownerId: 'user-1' },
        },
      ];
      prismaMock.membership.findMany.mockResolvedValue(memberships);

      const result = await service.listMyTenants('user-1');

      expect(result).toEqual([
        {
          tenant: { id: 'tenant-1', name: 'Tenant', ownerId: 'user-1' },
          role: MemberRole.TENANT_ADMIN,
          membershipId: 'membership-1',
        },
      ]);
    });

    it('returns an empty array when the user has no memberships', async () => {
      prismaMock.membership.findMany.mockResolvedValue([]);

      const result = await service.listMyTenants('user-2');

      expect(result).toEqual([]);
    });

    it('preserves the input ordering from the data source', async () => {
      const memberships: MembershipRecord[] = [
        {
          id: 'membership-2',
          role: MemberRole.PRODUCER,
          tenant: { id: 'tenant-2', name: 'Tenant 2', ownerId: 'user-2' },
        },
        {
          id: 'membership-1',
          role: MemberRole.TENANT_ADMIN,
          tenant: { id: 'tenant-1', name: 'Tenant 1', ownerId: 'user-1' },
        },
      ];
      prismaMock.membership.findMany.mockResolvedValue(memberships);

      const result = await service.listMyTenants('user-1');

      expect(result.map((x) => x.membershipId)).toEqual([
        'membership-2',
        'membership-1',
      ]);
    });
  });
});
