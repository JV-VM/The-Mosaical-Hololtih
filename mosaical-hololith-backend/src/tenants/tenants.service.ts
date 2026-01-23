import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(params: { name: string; ownerId: string }) {
    return this.prisma.tenant.create({
      data: {
        name: params.name,
        ownerId: params.ownerId,
        members: {
          create: {
            userId: params.ownerId,
            role: 'TENANT_ADMIN',
          },
        },
      },
      include: { members: true },
    });
  }

  async listMyTenants(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        tenant: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      tenant: {
        id: m.tenant.id,
        name: m.tenant.name,
        ownerId: m.tenant.ownerId,
      },
      role: m.role,
      membershipId: m.id,
    }));
  }
}
