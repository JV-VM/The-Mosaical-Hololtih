import { Prisma } from '@prisma/client';
import { toJsonInputOrThrow } from './json-input';

describe('toJsonInputOrThrow', () => {
  it('accepts primitives, arrays, and objects', () => {
    expect(toJsonInputOrThrow(undefined)).toBeUndefined();
    expect(toJsonInputOrThrow(null)).toBeNull();
    expect(toJsonInputOrThrow('ok')).toBe('ok');
    expect(toJsonInputOrThrow(42)).toBe(42);
    expect(toJsonInputOrThrow(false)).toBe(false);
    expect(toJsonInputOrThrow([1, 'two', null])).toEqual([1, 'two', null]);
    expect(
      toJsonInputOrThrow({ a: 1, b: { c: true }, d: [null, 'x'] }),
    ).toEqual({ a: 1, b: { c: true }, d: [null, 'x'] });
  });

  it('rejects non-JSON values', () => {
    expect(() => toJsonInputOrThrow(() => undefined)).toThrow('Invalid media');
    expect(() => toJsonInputOrThrow(Symbol('x'))).toThrow('Invalid media');
    expect(() => toJsonInputOrThrow(BigInt(1))).toThrow('Invalid media');
    expect(() => toJsonInputOrThrow(new Date())).toThrow('Invalid media');
    class Foo {}
    expect(() => toJsonInputOrThrow(new Foo())).toThrow('Invalid media');
  });

  it('rejects Prisma null sentinels', () => {
    expect(() => toJsonInputOrThrow(Prisma.JsonNull)).toThrow('Invalid media');
    expect(() => toJsonInputOrThrow(Prisma.DbNull)).toThrow('Invalid media');
    expect(() => toJsonInputOrThrow(Prisma.AnyNull)).toThrow('Invalid media');
  });
});
