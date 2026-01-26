import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]';

const isPrismaNullSentinel = (value: unknown): boolean =>
  value === Prisma.DbNull ||
  value === Prisma.JsonNull ||
  value === Prisma.AnyNull;

export const isJsonInput = (value: unknown): value is Prisma.InputJsonValue => {
  if (isPrismaNullSentinel(value)) {
    return false;
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonInput);
  }

  if (isPlainObject(value)) {
    return Object.values(value).every(isJsonInput);
  }

  return false;
};

export const toJsonInputOrThrow = (
  value: unknown,
): Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  if (!isJsonInput(value)) {
    throw new BadRequestException('Invalid media');
  }

  return value;
};
