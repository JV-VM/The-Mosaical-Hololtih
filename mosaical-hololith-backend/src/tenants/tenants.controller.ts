import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantsService } from './tenants.service';

@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateTenantDto) {
    return this.tenants.createTenant({ name: dto.name, ownerId: user.id });
  }

  @Get('me')
  listMine(@CurrentUser() user: { id: string }) {
    return this.tenants.listMyTenants(user.id);
  }
}