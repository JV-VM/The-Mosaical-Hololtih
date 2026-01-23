import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class TenantMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new UnauthorizedException();

    const tenantId = (req.headers['x-tenant-id'] as string | undefined)?.trim();
    if (!tenantId) {
      throw new ForbiddenException('Missing X-Tenant-Id header');
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        tenantId_userId: { tenantId, userId: user.id },
      },
      select: { id: true, role: true },
    });

    if (!membership)
      throw new ForbiddenException('Not a member of this tenant');

    // expose tenant context to downstream handlers
    req.tenantId = tenantId;
    req.membership = membership;

    return true;
  }
}
