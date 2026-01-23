import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import express from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../tenants/guards/tenant-member.guard';
import { PagesService } from './pages.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';

@Controller()
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  // -----------------------
  // Dashboard (tenant scoped)
  // -----------------------

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('pages')
  create(@Req() req: express.Request, @Body() dto: CreatePageDto) {
    const tenantId = req.tenantId!;
    return this.pages.createPage({
      tenantId,
      storeId: dto.storeId,
      title: dto.title,
      slug: dto.slug,
      content: dto.content,
    });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Get('pages')
  list(@Req() req: express.Request, @Query('storeId') storeId?: string) {
    const tenantId = req.tenantId!;
    return this.pages.listPages({ tenantId, storeId });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Patch('pages/:id')
  update(@Req() req: express.Request, @Param('id') id: string, @Body() dto: UpdatePageDto) {
    const tenantId = req.tenantId!;
    return this.pages.updatePage({
      tenantId,
      pageId: id,
      patch: {
        title: dto.title,
        slug: dto.slug,
        content: dto.content,
      },
    });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('pages/:id/publish')
  publish(@Req() req: express.Request, @Param('id') id: string) {
    const tenantId = req.tenantId!;
    return this.pages.publishPage(tenantId, id);
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('pages/:id/unpublish')
  unpublish(@Req() req: express.Request, @Param('id') id: string) {
    const tenantId = req.tenantId!;
    return this.pages.unpublishPage(tenantId, id);
  }

  // -----------------------
  // Public
  // -----------------------

  @Get('stores/:storeSlug/pages/:pageSlug')
  publicGet(@Param('storeSlug') storeSlug: string, @Param('pageSlug') pageSlug: string) {
    return this.pages.publicGetPageBySlug({ storeSlug, pageSlug });
  }
}