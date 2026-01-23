import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import express from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../tenants/guards/tenant-member.guard';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoresService } from './stores.service';

@Controller()
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  // Dashboard (tenant scoped)
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('stores')
  create(@Req() req: express.Request, @Body() dto: CreateStoreDto) {
    const tenantId = req.tenantId!;
    return this.stores.createStore({
      tenantId,
      name: dto.name,
      slug: dto.slug,
      subdomain: dto.subdomain,
      customDomain: dto.customDomain,
    });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Get('stores')
  listMine(@Req() req: express.Request) {
    const tenantId = req.tenantId!;
    return this.stores.listStoresByTenant(tenantId);
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Patch('stores/:id')
  update(
    @Req() req: express.Request,
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    const tenantId = req.tenantId!;
    return this.stores.updateStore({
      tenantId,
      storeId: id,
      patch: {
        name: dto.name,
        slug: dto.slug,
        subdomain: dto.subdomain,
        customDomain: dto.customDomain ?? undefined,
      },
    });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('stores/:id/publish')
  publish(@Req() req: express.Request, @Param('id') id: string) {
    const tenantId = req.tenantId!;
    return this.stores.publishStore(tenantId, id);
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('stores/:id/unpublish')
  unpublish(@Req() req: express.Request, @Param('id') id: string) {
    const tenantId = req.tenantId!;
    return this.stores.unpublishStore(tenantId, id);
  }

  // Public
  @Get('stores/:slug')
  publicBySlug(@Param('slug') slug: string) {
    return this.stores.publicGetStoreBySlug(slug);
  }
}
