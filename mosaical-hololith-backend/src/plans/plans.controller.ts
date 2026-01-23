import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import express from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../tenants/guards/tenant-member.guard';
import { PlansService } from './plans.service';

class UpgradeDto {
  planCode!: 'free' | 'starter' | 'pro' | 'business';
}

@Controller()
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Get('billing/plan')
  async currentPlan(@Req() req: express.Request) {
    const tenantId = req.tenantId!;
    const info = await this.plans.getTenantPlan(tenantId);
    const usage = await this.plans.computeUsage(tenantId, info.plan.quotas);
    return { ...info, usage };
  }

  // MVP: upgrades without payments. Lock this behind Stripe later.
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('billing/upgrade')
  async upgrade(@Req() req: express.Request, @Body() dto: UpgradeDto) {
    const tenantId = req.tenantId!;
    const sub = await this.plans.setTenantPlan(tenantId, dto.planCode);
    return {
      subscription: { id: sub.id, status: sub.status },
      plan: {
        code: sub.plan.code,
        name: sub.plan.name,
        quotas: sub.plan.quotas,
        features: sub.plan.features ?? {},
      },
    };
  }
}
