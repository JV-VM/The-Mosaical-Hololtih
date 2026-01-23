import { Controller, Get, Query } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';

@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('explore')
  explore(
    @Query('q') q?: string,
    @Query('tags') tags?: string,
    @Query('type') type?: 'store' | 'product' | 'all',
    @Query('sort') sort?: 'new' | 'name' | 'price',
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    return this.discovery.explore({
      q,
      tags: tags ? tags.split(',').map((t) => t.trim()) : [],
      type: type ?? 'all',
      sort: sort ?? 'new',
      limit: Math.min(Number(limit) || 20, 50),
      offset: Number(offset) || 0,
    });
  }
}
