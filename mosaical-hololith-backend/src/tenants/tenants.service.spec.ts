import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MemberRole } from '@prisma/client';

describe('TenantsService', () => {
  let service: TenantsService;
  let prisma: {
    tenant: { create: jest.Mock };
    membership: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      tenant: { create: jest.fn() },
      membership: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  it('createTenant creates the tenant and assigns TENANT_ADMIN to the owner', async () => {
    prisma.tenant.create.mockResolvedValue({ id: 'tenant-1' });

    await service.createTenant({ name: 'Tenant', ownerId: 'user-1' });

    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Tenant',
          ownerId: 'user-1',
          members: {
            create: {
              userId: 'user-1',
              role: MemberRole.TENANT_ADMIN,
            },
          },
        }),
        include: { members: true },
      }),
    );
  });

  it('listMyTenants maps memberships into a stable response shape', async () => {
    prisma.membership.findMany.mockResolvedValue([
      {
        id: 'membership-1',
        role: MemberRole.TENANT_ADMIN,
        tenant: { id: 'tenant-1', name: 'Tenant', ownerId: 'user-1' },
      },
    ]);

    const result = await service.listMyTenants('user-1');

    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
      }),
    );
    expect(result).toEqual([
      {
        tenant: { id: 'tenant-1', name: 'Tenant', ownerId: 'user-1' },
        role: MemberRole.TENANT_ADMIN,
        membershipId: 'membership-1',
      },
    ]);
  });
});
