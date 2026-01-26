import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import express from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../tenants/guards/tenant-member.guard';
import { AnalyticsService } from './analytics.service';
import { TrackViewDto } from './dto/track-view.dto';
import { TrackBatchDto } from './dto/track-batch.dto';

@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // Public: track views
  @Post('analytics/view')
  track(@Body() dto: TrackViewDto) {
    return this.analytics.trackView({
      type: dto.type,
      storeId: dto.storeId,
      productId: dto.productId,
      pageId: dto.pageId,
      viewerId: dto.viewerId,
    });
  }

  @Post('analytics/batch')
  async batch(@Body() dto: TrackBatchDto) {
    // run sequentially (MVP) or parallel with Promise.allSettled
    for (const e of dto.events) {
      await this.analytics.trackView({
        type: e.type,
        storeId: e.storeId,
        productId: e.productId,
        pageId: e.pageId,
        viewerId: e.viewerId,
      });
    }
    return { ok: true, count: dto.events.length };
  }

  // Dashboard: overview totals
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Get('dashboard/analytics/overview')
  overview(@Req() req: express.Request) {
    const tenantId = req.tenantId!;
    return this.analytics.assertDashboardOverview(tenantId);
  }

  // Dashboard: last 7 days series
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Get('dashboard/analytics/last7days')
  last7days(@Req() req: express.Request) {
    const tenantId = req.tenantId!;
    return this.analytics.last7Days(tenantId);
  }

  // Dashboard: store stats
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Get('dashboard/analytics/store')
  storeStats(@Req() req: express.Request, @Query('storeId') storeId: string) {
    const tenantId = req.tenantId!;
    return this.analytics.storeStats(tenantId, storeId);
  }
}
