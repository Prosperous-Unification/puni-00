import { describe, expect, it } from 'bun:test';

import { effectivePoolSizesOf, isResourceKind, refuseDemand } from './resource';

describe('effectivePoolSizesOf', () => {
  it('keeps all project statements and adds only demanded directory pools', () => {
    const project = [
      { resourceId: 'zero', units: 32 },
      { resourceId: 'private', units: 9 },
      { resourceId: 'room', units: 32 },
      { resourceId: 'higher', units: 2 },
      { resourceId: 'unused-project', units: 13 },
    ];
    const directory = [
      { resourceId: 'unused-directory', units: 3 },
      { resourceId: 'shared', units: 4 },
      { resourceId: 'higher', units: 6 },
      { resourceId: 'room', units: 16 },
      { resourceId: 'zero', units: 0 },
      { resourceId: 'directory-zero', units: 0 },
    ];
    const demanded = new Set(['none', 'shared', 'directory-zero']);
    expect(effectivePoolSizesOf(project, directory, demanded)).toEqual(
      new Map([
        ['zero', 0],
        ['private', 9],
        ['room', 16],
        ['higher', 2],
        ['unused-project', 13],
        ['shared', 4],
        ['directory-zero', 0],
      ]),
    );
    expect(effectivePoolSizesOf([], [], demanded)).toEqual(new Map());
  });
});

describe('refuseDemand', () => {
  // Proof: with the kind test removed from refuseDemand, the exclusive case
  // below answered null for 2 units; watched 2026-10-20.
  it('refuses any units but 1 on an exclusive resource', () => {
    expect(refuseDemand('exclusive', 2)).toBe('exclusive_demand_is_one');
    expect(refuseDemand('exclusive', 1)).toBeNull();
  });

  it('takes any bounded units on a divisible resource', () => {
    expect(refuseDemand('divisible', 1)).toBeNull();
    expect(refuseDemand('divisible', 4096)).toBeNull();
  });
});

describe('isResourceKind', () => {
  it('names exactly the two kinds', () => {
    expect(isResourceKind('exclusive')).toBe(true);
    expect(isResourceKind('divisible')).toBe(true);
    expect(isResourceKind('renewable')).toBe(false);
    expect(isResourceKind(1)).toBe(false);
  });
});
