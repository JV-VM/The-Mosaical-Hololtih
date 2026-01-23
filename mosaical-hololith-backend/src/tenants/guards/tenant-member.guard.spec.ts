import { TenantMemberGuard } from './tenant-member.guard';

describe('TenantMemberGuard', () => {
  it('should be defined', () => {
    expect(new TenantMemberGuard(
      {} as any,
    )).toBeDefined();
  });
});
