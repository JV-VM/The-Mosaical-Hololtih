import { TenantMemberGuard } from './tenant-member.guard';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TenantMemberGuard', () => {
  let guard: TenantMemberGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantMemberGuard, PrismaService],
    }).compile();

    guard = module.get<TenantMemberGuard>(TenantMemberGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
