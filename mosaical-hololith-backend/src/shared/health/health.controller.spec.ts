import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('live returns ok without hitting the database', () => {
    expect(controller.live()).toEqual({ ok: true });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('ready checks the database', async () => {
    await expect(controller.ready()).resolves.toEqual({ ok: true });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('health/db alias also checks the database', async () => {
    await expect(controller.healthDbPathAlias()).resolves.toEqual({ ok: true });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
