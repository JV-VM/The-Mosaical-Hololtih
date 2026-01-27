import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  private async checkDb(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  // Canonical operational endpoints
  @Get('live')
  live() {
    return { ok: true };
  }

  @Get('ready')
  async ready() {
    await this.checkDb();
    return { ok: true };
  }

  @Get('db')
  async db() {
    await this.checkDb();
    return { ok: true };
  }

  // Backward-compatible aliases (deprecate later)
  @Get()
  healthAlias() {
    return this.live();
  }

  @Get('health')
  healthPathAlias() {
    return this.live();
  }

  @Get('health/db')
  async healthDbPathAlias() {
    await this.checkDb();
    return { ok: true };
  }
}
