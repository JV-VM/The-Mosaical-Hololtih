import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ProductStatus, StoreStatus } from '@prisma/client';

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async explore(params: {
    q?: string;
    tags?: string[];
    type?: 'store' | 'product' | 'all';
    sort?: 'new' | 'name' | 'price';
    limit: number;
    offset: number;
  }) {
    const { q, tags = [], type = 'all', sort = 'new', limit, offset } = params;

    const tagFilter =
      tags.length > 0
        ? {
            some: {
              tag: { slug: { in: tags } },
            },
          }
        : undefined;

    const orderByStore =
      sort === 'name'
        ? { name: 'asc' as const }
        : { createdAt: 'desc' as const };

    const orderByProduct =
      sort === 'price'
        ? { priceCents: 'asc' as const }
        : sort === 'name'
          ? { title: 'asc' as const }
          : { createdAt: 'desc' as const };

    const results: any = {};

    // -----------------------
    // STORES
    // -----------------------
    if (type === 'store' || type === 'all') {
      results.stores = await this.prisma.store.findMany({
        where: {
          status: StoreStatus.PUBLISHED,
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { slug: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(tagFilter
            ? {
                storeTags: tagFilter,
              }
            : {}),
        },
        orderBy: orderByStore,
        take: limit,
        skip: offset,
        select: {
          id: true,
          slug: true,
          name: true,
          subdomain: true,
          customDomain: true,
          createdAt: true,
          storeTags: {
            select: {
              tag: { select: { slug: true, name: true } },
            },
          },
        },
      });
    }

    // -----------------------
    // PRODUCTS
    // -----------------------
    if (type === 'product' || type === 'all') {
      results.products = await this.prisma.product.findMany({
        where: {
          status: ProductStatus.PUBLISHED,
          store: { status: StoreStatus.PUBLISHED },
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: 'insensitive' } },
                  { slug: { contains: q, mode: 'insensitive' } },
                  { description: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(tagFilter
            ? {
                productTags: tagFilter,
              }
            : {}),
        },
        orderBy: orderByProduct,
        take: limit,
        skip: offset,
        select: {
          id: true,
          slug: true,
          title: true,
          priceCents: true,
          currency: true,
          media: true,
          createdAt: true,
          store: {
            select: {
              slug: true,
              name: true,
            },
          },
          productTags: {
            select: {
              tag: { select: { slug: true, name: true } },
            },
          },
        },
      });
    }

    return {
      query: { q, tags, type, sort, limit, offset },
      results,
    };
  }
}
