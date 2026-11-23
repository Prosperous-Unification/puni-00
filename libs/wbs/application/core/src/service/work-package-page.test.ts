import { describe, expect, test } from 'bun:test';

import { decodeCursor, encodeCursor } from './list-query';
import { type PageableWorkPackage, pageWorkPackages, workPackageKeyOf } from './work-package-page';

const workPackage = (id: string, updatedAt: number | null, name = id): PageableWorkPackage => ({
  id,
  name,
  updatedAt,
});
const everything = { search: null, updatedSince: null, limit: 25, after: null };

/** Follows `nextCursor` to the end, answering each page's ids. */
function walk(workPackages: readonly PageableWorkPackage[], limit: number): string[][] {
  const pages: string[][] = [];
  let after = null;
  for (;;) {
    const page = pageWorkPackages(workPackages, { ...everything, limit, after });
    pages.push(page.workPackages.map((entry) => entry.id));
    if (page.nextCursor === null) return pages;
    after = workPackageKeyOf(decodeCursor(page.nextCursor));
    if (after === null) throw new Error('issued a cursor it cannot read');
  }
}

describe('pageWorkPackages', () => {
  test('a tie is broken by id and a null instant sorts last', () => {
    expect(walk([workPackage('c', null), workPackage('a', 5), workPackage('b', 5)], 1)).toEqual([
      ['b'],
      ['a'],
      ['c'],
    ]);
  });

  test('newest update first, and the last page has no cursor', () => {
    const workPackages = [workPackage('p1', 1), workPackage('p3', 3), workPackage('p2', 2)];
    expect(walk(workPackages, 2)).toEqual([['p3', 'p2'], ['p1']]);
    expect(pageWorkPackages(workPackages, { ...everything, limit: 3 }).nextCursor).toBeNull();
  });

  test('updatedSince is inclusive and never matches null', () => {
    const page = pageWorkPackages(
      [workPackage('at', 1000), workPackage('before', 999), workPackage('never', null)],
      {
        ...everything,
        updatedSince: 1000,
      },
    );
    expect(page.workPackages.map((entry) => entry.id)).toEqual(['at']);
  });

  test('searches names case-insensitively', () => {
    const page = pageWorkPackages(
      [
        workPackage('1', 3, 'Roof Repair'),
        workPackage('2', 2, 'Garden'),
        workPackage('3', 1, 'roofline'),
      ],
      { ...everything, search: 'ROOF' },
    );
    expect(page.workPackages.map((entry) => entry.name)).toEqual(['Roof Repair', 'roofline']);
  });

  test('a work package edited mid-walk is not answered again', () => {
    const before = [workPackage('p3', 3), workPackage('p2', 2), workPackage('p1', 1)];
    const first = pageWorkPackages(before, { ...everything, limit: 2 });
    expect(first.workPackages.map((entry) => entry.id)).toEqual(['p3', 'p2']);
    if (first.nextCursor === null) throw new Error('expected a second page');
    // p2 was the boundary entry and is edited before the next read.
    const after = [workPackage('p3', 3), workPackage('p2', 9), workPackage('p1', 1)];
    const second = pageWorkPackages(after, {
      ...everything,
      limit: 2,
      after: workPackageKeyOf(decodeCursor(first.nextCursor)),
    });
    expect(second.workPackages.map((entry) => entry.id)).toEqual(['p1']);
  });
});

describe('a walk is not a snapshot', () => {
  test('a work package not yet answered that is edited mid-walk is missed', () => {
    const first = pageWorkPackages(
      [workPackage('p3', 3), workPackage('p2', 2), workPackage('p1', 1)],
      {
        ...everything,
        limit: 1,
      },
    );
    if (first.nextCursor === null) throw new Error('expected a second page');
    const after = workPackageKeyOf(decodeCursor(first.nextCursor));
    const edited = [workPackage('p3', 3), workPackage('p2', 2), workPackage('p1', 9)];
    const second = pageWorkPackages(edited, { ...everything, limit: 1, after });
    // The walk ends at p2: p1 moved ahead of the cursor and is never answered.
    expect(second.workPackages.map((entry) => entry.id)).toEqual(['p2']);
    expect(second.nextCursor).toBeNull();
  });

  test('a work package whose instant went down is answered again', () => {
    const first = pageWorkPackages([workPackage('p3', 3), workPackage('p2', 2)], {
      ...everything,
      limit: 1,
    });
    if (first.nextCursor === null) throw new Error('expected a second page');
    // p3's newest plan event was pruned; its instant fell back to 1.
    const second = pageWorkPackages([workPackage('p3', 1), workPackage('p2', 2)], {
      ...everything,
      limit: 2,
      after: workPackageKeyOf(decodeCursor(first.nextCursor)),
    });
    expect(second.workPackages.map((entry) => entry.id)).toEqual(['p2', 'p3']);
  });
});

describe('workPackageKeyOf', () => {
  test('reads the key it issued', () => {
    expect(workPackageKeyOf(decodeCursor(encodeCursor({ v: 1, k: [null, 'p'] })))).toEqual([
      null,
      'p',
    ]);
  });

  test('refuses a cursor that is not a work package cursor', () => {
    for (const cursor of [
      { v: 2, k: [1, 'p'] },
      { v: 1, k: [1, 'p'], extra: true },
      { v: 1 },
      { v: 1, k: ['x', 'p'] },
      { v: 1, k: [1.5, 'p'] },
      { v: 1, k: [1, ''] },
      { v: 1, k: [1, 'p', 2] },
      { v: 1, after: 'p' },
      [1, 'p'],
      'p',
      null,
    ])
      expect({ cursor, key: workPackageKeyOf(cursor) }).toEqual({ cursor, key: null });
  });
});
