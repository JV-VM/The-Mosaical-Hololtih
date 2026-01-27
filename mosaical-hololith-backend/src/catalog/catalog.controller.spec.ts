import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../tenants/guards/tenant-member.guard';

describe('CatalogController', () => {
  let controller: CatalogController;
  let catalog: { createProduct: jest.Mock };

  beforeEach(async () => {
    catalog = {
      createProduct: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        {
          provide: CatalogService,
          useValue: catalog,
        },
        {
          provide: JwtAuthGuard,
          useValue: { canActivate: jest.fn(() => true) },
        },
        {
          provide: TenantMemberGuard,
          useValue: { canActivate: jest.fn(() => true) },
        },
      ],
    }).compile();

    controller = module.get<CatalogController>(CatalogController);
  });

  it('create forwards tenantId and sanitized media to the service', () => {
    const req = { tenantId: 'tenant-1' } as any;
    const dto = {
      storeId: 'store-1',
      title: 'Product',
      slug: 'product',
      description: 'Desc',
      priceCents: 1234,
      currency: 'USD',
      media: { images: ['https://cdn.example.com/a.png'] },
    } as any;

    controller.create(req, dto);

    expect(catalog.createProduct).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      title: 'Product',
      slug: 'product',
      description: 'Desc',
      priceCents: 1234,
      currency: 'USD',
      media: dto.media,
    });
  });

  it('create rejects requests without tenant context', () => {
    const dto = {
      storeId: 'store-1',
      title: 'Product',
      slug: 'product',
      priceCents: 1234,
      currency: 'USD',
    } as any;

    expect(() => controller.create({} as any, dto)).toThrow(ForbiddenException);
    expect(catalog.createProduct).not.toHaveBeenCalled();
  });
});
