import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';

type ExploreType = 'store' | 'product' | 'all';
type ExploreSort = 'new' | 'name' | 'price';

type TagFilter = {
  some: {
    tag: {
      slug: {
        in: string[];
      };
    };
  };
};

const storeSelect = {
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
} as const;

const productSelect = {
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
} as const;

type StoreItem = Prisma.StoreGetPayload<{ select: typeof storeSelect }>;
type ProductItem = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

type ExploreResults = {
  stores?: StoreItem[];
  products?: ProductItem[];
};

const buildTagFilter = (tags: string[]): TagFilter | undefined => {
  if (tags.length === 0) return undefined;
  return {
    some: {
      tag: { slug: { in: tags } },
    },
  };
};

const buildStoreWhere = (
  q: string | undefined,
  tagFilter: TagFilter | undefined,
): Prisma.StoreWhereInput => {
  const where: Prisma.StoreWhereInput = {
    status: StoreStatus.PUBLISHED,
  };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (tagFilter) {
    where.storeTags = tagFilter;
  }

  return where;
};

const buildProductWhere = (
  q: string | undefined,
  tagFilter: TagFilter | undefined,
): Prisma.ProductWhereInput => {
  const where: Prisma.ProductWhereInput = {
    status: ProductStatus.PUBLISHED,
    store: { status: StoreStatus.PUBLISHED },
  };

  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (tagFilter) {
    where.productTags = tagFilter;
  }

  return where;
};

const buildOrderByStore = (
  sort: ExploreSort,
): Prisma.StoreOrderByWithRelationInput => {
  if (sort === 'name') {
    return { name: 'asc' };
  }

  return { createdAt: 'desc' };
};

const buildOrderByProduct = (
  sort: ExploreSort,
): Prisma.ProductOrderByWithRelationInput => {
  if (sort === 'price') {
    return { priceCents: 'asc' };
  }

  if (sort === 'name') {
    return { title: 'asc' };
  }

  return { createdAt: 'desc' };
};

const fetchStores = (
  prisma: PrismaService,
  where: Prisma.StoreWhereInput,
  orderBy: Prisma.StoreOrderByWithRelationInput,
  limit: number,
  offset: number,
) =>
  prisma.store.findMany({
    where,
    orderBy,
    take: limit,
    skip: offset,
    select: storeSelect,
  });

const fetchProducts = (
  prisma: PrismaService,
  where: Prisma.ProductWhereInput,
  orderBy: Prisma.ProductOrderByWithRelationInput,
  limit: number,
  offset: number,
) =>
  prisma.product.findMany({
    where,
    orderBy,
    take: limit,
    skip: offset,
    select: productSelect,
  });

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async explore(params: {
    q?: string;
    tags?: string[];
    type?: ExploreType;
    sort?: ExploreSort;
    limit: number;
    offset: number;
  }): Promise<{ query: typeof params; results: ExploreResults }> {
    const { q, tags = [], type = 'all', sort = 'new', limit, offset } = params;
    const tagFilter = buildTagFilter(tags);
    const storeWhere = buildStoreWhere(q, tagFilter);
    const productWhere = buildProductWhere(q, tagFilter);
    const orderByStore = buildOrderByStore(sort);
    const orderByProduct = buildOrderByProduct(sort);
    const results: ExploreResults = {};

    if (type === 'all') {
      const [stores, products] = await Promise.all([
        fetchStores(this.prisma, storeWhere, orderByStore, limit, offset),
        fetchProducts(this.prisma, productWhere, orderByProduct, limit, offset),
      ]);
      results.stores = stores;
      results.products = products;
    }

    if (type === 'store') {
      results.stores = await fetchStores(
        this.prisma,
        storeWhere,
        orderByStore,
        limit,
        offset,
      );
    }

    if (type === 'product') {
      results.products = await fetchProducts(
        this.prisma,
        productWhere,
        orderByProduct,
        limit,
        offset,
      );
    }

    return {
      query: { q, tags, type, sort, limit, offset },
      results,
    };
  }
}
