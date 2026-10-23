import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { isOrganizationLimit, refuseCapacityStatement, refuseLimit } from './organization-limits';

describe('refuseLimit', () => {
  it('admits an acquisition under the cap', () => {
    expect(refuseLimit({ cap: 8, current: 6, added: 1 })).toBeNull();
  });

  it('admits the acquisition that reaches the cap exactly', () => {
    expect(refuseLimit({ cap: 8, current: 7, added: 1 })).toBeNull();
    expect(refuseLimit({ cap: 8, current: 5, added: 3 })).toBeNull();
  });

  it('refuses at the cap, naming the cap, the count and what was added', () => {
    expect(refuseLimit({ cap: 8, current: 8, added: 1 })).toEqual({
      cap: 8,
      current: 8,
      added: 1,
    });
    expect(refuseLimit({ cap: 8, current: 6, added: 3 })).toEqual({
      cap: 8,
      current: 6,
      added: 3,
    });
  });

  it('refuses every acquisition while a lowered cap sits below the count', () => {
    expect(refuseLimit({ cap: 10, current: 40, added: 1 })).toEqual({
      cap: 10,
      current: 40,
      added: 1,
    });
  });

  it('refuses everything under a cap of zero', () => {
    expect(refuseLimit({ cap: 0, current: 0, added: 1 })).not.toBeNull();
  });

  it('refuses exactly when current + added exceeds the cap', () => {
    fc.assert(
      // The cap sits within three of `current + added`, so the boundary is
      // drawn as often as either side of it.
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000 }),
        fc.integer({ min: -3, max: 3 }),
        (current, added, offset) => {
          const cap = Math.max(0, current + added + offset);
          const refused = refuseLimit({ cap, current, added });
          expect(refused === null).toBe(current + added <= cap);
        },
      ),
    );
  });

  it('throws for a caller that adds nothing, or a malformed cap or count', () => {
    expect(() => refuseLimit({ cap: 8, current: 8, added: 0 })).toThrow('at least one');
    expect(() => refuseLimit({ cap: 8, current: 1, added: 1.5 })).toThrow('at least one');
    expect(() => refuseLimit({ cap: -1, current: 0, added: 1 })).toThrow('whole cap and count');
    expect(() => refuseLimit({ cap: 8, current: Number.NaN, added: 1 })).toThrow(
      'whole cap and count',
    );
  });
});

describe('isOrganizationLimit', () => {
  it('admits whole numbers from 0 to 1,000,000 and nothing else', () => {
    for (const value of [0, 1, 8, 1_000_000]) expect(isOrganizationLimit(value)).toBe(true);
    for (const value of [-1, 1.5, 1_000_001, Number.NaN, Number.POSITIVE_INFINITY])
      expect(isOrganizationLimit(value)).toBe(false);
  });
});

describe('refuseCapacityStatement', () => {
  const ram = (declared: number, held: number, asked: number, cap = 64) =>
    refuseCapacityStatement({ resourceId: 'ram', cap, declared, held, asked });

  it('refuses a statement whose other projects plus the asked cross the cap, naming all four', () => {
    expect(ram(48, 0, 32)).toEqual({ resourceId: 'ram', cap: 64, declared: 48, asked: 32 });
    expect(ram(48, 0, 16)).toBeNull();
  });

  it('replaces the project’s own units rather than counting them twice', () => {
    // The project states 48 alone; raising to 64 reaches the cap exactly.
    expect(ram(0, 48, 64)).toBeNull();
    expect(ram(0, 48, 65)).toEqual({ resourceId: 'ram', cap: 64, declared: 0, asked: 65 });
  });

  it('never refuses restating or lowering, even above a lowered cap', () => {
    expect(ram(0, 48, 48, 32)).toBeNull();
    expect(ram(0, 48, 40, 32)).toBeNull();
    expect(ram(100, 0, 0, 32)).toBeNull();
    expect(ram(0, 48, 49, 32)).toEqual({ resourceId: 'ram', cap: 32, declared: 0, asked: 49 });
  });

  it('refuses exactly a raise past the cap, as a property', () => {
    fc.assert(
      fc.property(
        fc.nat(200),
        fc.nat(200),
        fc.nat(200),
        fc.nat(200),
        (cap, declared, held, asked) => {
          const refused = ram(declared, held, asked, cap) !== null;
          expect(refused).toBe(asked > held && declared + asked > cap);
        },
      ),
    );
  });

  it('throws on units that are not whole', () => {
    expect(() => ram(0, -1, 4)).toThrow('whole units');
    expect(() => ram(0, 0, 1.5)).toThrow('whole units');
  });
});
