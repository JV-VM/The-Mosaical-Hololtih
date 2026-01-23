import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import express from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../tenants/guards/tenant-member.guard';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // -----------------------
  // Dashboard (tenant scoped)
  // -----------------------

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('products')
  create(@Req() req: express.Request, @Body() dto: CreateProductDto) {
    const tenantId = req.tenantId!;
    return this.catalog.createProduct({
      tenantId,
      storeId: dto.storeId,
      title: dto.title,
      slug: dto.slug,
      description: dto.description,
      priceCents: dto.priceCents,
      currency: dto.currency,
      media: dto.media,
    });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Get('products')
  list(@Req() req: express.Request, @Query('storeId') storeId?: string) {
    const tenantId = req.tenantId!;
    return this.catalog.listProducts({ tenantId, storeId });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Patch('products/:id')
  update(@Req() req: express.Request, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    const tenantId = req.tenantId!;
    return this.catalog.updateProduct({
      tenantId,
      productId: id,
      patch: {
        title: dto.title,
        slug: dto.slug,
        description: dto.description,
        priceCents: dto.priceCents,
        currency: dto.currency,
        media: dto.media,
      },
    });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('products/:id/publish')
  publish(@Req() req: express.Request, @Param('id') id: string) {
    const tenantId = req.tenantId!;
    return this.catalog.publishProduct(tenantId, id);
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('products/:id/unpublish')
  unpublish(@Req() req: express.Request, @Param('id') id: string) {
    const tenantId = req.tenantId!;
    return this.catalog.unpublishProduct(tenantId, id);
  }

  // -----------------------
  // Public
  // -----------------------

  @Get('stores/:storeSlug/products')
  publicList(@Param('storeSlug') storeSlug: string) {
    return this.catalog.publicListProductsByStoreSlug(storeSlug);
  }

  @Get('stores/:storeSlug/p/:productSlug')
  publicDetail(@Param('storeSlug') storeSlug: string, @Param('productSlug') productSlug: string) {
    return this.catalog.publicGetProductByStoreSlug(storeSlug, productSlug);
  }
}