import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../tenants/guards/tenant-member.guard';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { toJsonInputOrThrow } from './json-input';
import { ListProductsDto } from './dto/list-products.dto';
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  private getTenantIdOrThrow(req: RequestWithTenantId): string {
    if (!req.tenantId) {
      throw new ForbiddenException('Missing tenant context');
    }

    return req.tenantId;
  }

  // -----------------------
  // Dashboard (tenant scoped)
  // -----------------------

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('products')
  create(@Req() req: RequestWithTenantId, @Body() dto: CreateProductDto) {
    const tenantId = this.getTenantIdOrThrow(req);
    const media = toJsonInputOrThrow(dto.media);
    return this.catalog.createProduct({
      tenantId,
      storeId: dto.storeId,
      title: dto.title,
      slug: dto.slug,
      description: dto.description,
      priceCents: dto.priceCents,
      currency: dto.currency,
      media,
    });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Get('products')
  list(
    @Req() req: RequestWithTenantId,
    @Query('storeId') dto: ListProductsDto,
  ) {
    const tenantId = this.getTenantIdOrThrow(req);
    return this.catalog.listProducts({ tenantId, storeId: dto.storeId });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Patch('products/:id')
  update(
    @Req() req: RequestWithTenantId,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const tenantId = this.getTenantIdOrThrow(req);
    const media = toJsonInputOrThrow(dto.media);
    return this.catalog.updateProduct({
      tenantId,
      productId: id,
      patch: {
        title: dto.title,
        slug: dto.slug,
        description: dto.description,
        priceCents: dto.priceCents,
        currency: dto.currency,
        media,
      },
    });
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('products/:id/publish')
  publish(@Req() req: RequestWithTenantId, @Param('id') id: string) {
    const tenantId = this.getTenantIdOrThrow(req);
    return this.catalog.publishProduct(tenantId, id);
  }

  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  @Post('products/:id/unpublish')
  unpublish(@Req() req: RequestWithTenantId, @Param('id') id: string) {
    const tenantId = this.getTenantIdOrThrow(req);
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
  publicDetail(
    @Param('storeSlug') storeSlug: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.catalog.publicGetProductByStoreSlug(storeSlug, productSlug);
  }
}

type RequestWithTenantId = Request & { tenantId?: string };
