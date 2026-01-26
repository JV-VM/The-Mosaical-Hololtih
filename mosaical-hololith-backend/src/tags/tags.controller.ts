import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import express from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../tenants/guards/tenant-member.guard';
import { env } from '../shared/env';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { AssignTagDto } from './dto/assign-tag.dto';

@Controller()
export class TagsController {
  private readonly logger = new Logger(TagsController.name);

  constructor(private readonly tags: TagsService) {}

  private assertAdminOrThrow(req: express.Request) {
    if (!req.membership || req.membership.role !== 'TENANT_ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  // -----------------------
  // Public
  // -----------------------

  @Get('tags')
  listPublic() {
    return this.tags.publicListTags();
  }

  @Get('tags/:slug')
  landing(@Param('slug') slug: string) {
    return this.tags.publicTagLanding(slug);
  }

  // -----------------------
  // MVP Admin/Seed (lock later)
  // -----------------------
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('admin/tags')
  create(@Req() req: express.Request, @Body() dto: CreateTagDto) {
    if (env.NODE_ENV === 'production') {
      throw new ForbiddenException('Not available in production');
    }

    this.assertAdminOrThrow(req);
    this.logger.log(
      `admin tag seed tenantId=${req.tenantId} membershipId=${req.membership?.id}`,
    );

    return this.tags.createTag({
      name: dto.name,
      slug: dto.slug,
      tier: dto.tier,
      flags: dto.flags,
    });
  }

  // -----------------------
  // Tenant scoped assignments
  // -----------------------

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('stores/:storeId/tags')
  assignStoreTag(
    @Req() req: express.Request,
    @Param('storeId') storeId: string,
    @Body() dto: AssignTagDto,
  ) {
    const tenantId = req.tenantId!;
    return this.tags.assignTagToStore({ tenantId, storeId, tagId: dto.tagId });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Delete('stores/:storeId/tags/:tagId')
  unassignStoreTag(
    @Req() req: express.Request,
    @Param('storeId') storeId: string,
    @Param('tagId') tagId: string,
  ) {
    const tenantId = req.tenantId!;
    return this.tags.unassignTagFromStore({ tenantId, storeId, tagId });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('products/:productId/tags')
  assignProductTag(
    @Req() req: express.Request,
    @Param('productId') productId: string,
    @Body() dto: AssignTagDto,
  ) {
    const tenantId = req.tenantId!;
    return this.tags.assignTagToProduct({
      tenantId,
      productId,
      tagId: dto.tagId,
    });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Delete('products/:productId/tags/:tagId')
  unassignProductTag(
    @Req() req: express.Request,
    @Param('productId') productId: string,
    @Param('tagId') tagId: string,
  ) {
    const tenantId = req.tenantId!;
    return this.tags.unassignTagFromProduct({ tenantId, productId, tagId });
  }
}
