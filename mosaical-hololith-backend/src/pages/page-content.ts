import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type PageContent = {
  version: number;
  blocks: Prisma.InputJsonValue[];
};

export function isPageContent(value: unknown): value is PageContent {
  if (!value || typeof value !== 'object') return false;
  const content = value as { version?: unknown; blocks?: unknown };
  return typeof content.version === 'number' && Array.isArray(content.blocks);
}

export function assertValidContent(
  value: unknown,
): asserts value is PageContent {
  if (isPageContent(value)) return;
  throw new BadRequestException(
    'Invalid content shape. Expected { version:number, blocks:Prisma.InputJsonValue[] }',
  );
}
