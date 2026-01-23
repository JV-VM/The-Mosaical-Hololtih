import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './shared/prisma/prisma.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { StoresModule } from './stores/stores.module';
import { PagesModule } from './pages/pages.module';
import { CatalogModule } from './catalog/catalog.module';
import { TagsModule } from './tags/tags.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { PlansModule } from './plans/plans.module';
import { MediaModule } from './media/media.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthController } from './shared/health/health.controller';


@Module({
  imports: [
    // still useful for Nest conventions; we validate with Zod in env.ts
    ConfigModule.forRoot({ isGlobal: true }),

    PrismaModule,

    AuthModule,
    UsersModule,
    TenantsModule,
    StoresModule,
    PagesModule,
    CatalogModule,
    TagsModule,
    DiscoveryModule,
    PlansModule,
    MediaModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
