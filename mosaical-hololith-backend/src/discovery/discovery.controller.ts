import { Controller, Get, Query } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { ExploreQueryDto } from './explore-query.dto';

const normalizeQuery = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const parseTags = (value?: string): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
};

@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('explore')
  explore(@Query() query: ExploreQueryDto) {
    const q = normalizeQuery(query.q);
    const tags = parseTags(query.tags);
    const type = query.type ?? 'all';
    const sort = query.sort ?? 'new';
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    return this.discovery.explore({
      q,
      tags,
      type,
      sort,
      limit,
      offset,
    });
  }
}
