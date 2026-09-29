import { describe, expect, test } from 'bun:test';

import { decodeCursor, encodeCursor } from './list-query';
import { type PageableProject, pageProjects, projectKeyOf } from './project-page';

const project = (id: string, updatedAt: number | null, name = id): PageableProject => ({
  id,
  name,
  updatedAt,
});
const everything = { search: null, updatedSince: null, limit: 25, after: null };

/** Follows `nextCursor` to the end, answering each page's ids. */
function walk(projects: readonly PageableProject[], limit: number): string[][] {
  const pages: string[][] = [];
  let after = null;
  for (;;) {
    const page = pageProjects(projects, { ...everything, limit, after });
    pages.push(page.projects.map((entry) => entry.id));
    if (page.nextCursor === null) return pages;
    after = projectKeyOf(decodeCursor(page.nextCursor));
    if (after === null) throw new Error('issued a cursor it cannot read');
  }
}

describe('pageProjects', () => {
  test('a tie is broken by id and a null instant sorts last', () => {
    expect(walk([project('c', null), project('a', 5), project('b', 5)], 1)).toEqual([
      ['b'],
      ['a'],
      ['c'],
    ]);
  });

  test('newest update first, and the last page has no cursor', () => {
    const projects = [project('p1', 1), project('p3', 3), project('p2', 2)];
    expect(walk(projects, 2)).toEqual([['p3', 'p2'], ['p1']]);
    expect(pageProjects(projects, { ...everything, limit: 3 }).nextCursor).toBeNull();
  });

  test('updatedSince is inclusive and never matches null', () => {
    const page = pageProjects(
      [project('at', 1000), project('before', 999), project('never', null)],
      {
        ...everything,
        updatedSince: 1000,
      },
    );
    expect(page.projects.map((entry) => entry.id)).toEqual(['at']);
  });

  test('searches names case-insensitively', () => {
    const page = pageProjects(
      [project('1', 3, 'Roof Repair'), project('2', 2, 'Garden'), project('3', 1, 'roofline')],
      { ...everything, search: 'ROOF' },
    );
    expect(page.projects.map((entry) => entry.name)).toEqual(['Roof Repair', 'roofline']);
  });

  test('a project edited mid-walk is not answered again', () => {
    const before = [project('p3', 3), project('p2', 2), project('p1', 1)];
    const first = pageProjects(before, { ...everything, limit: 2 });
    expect(first.projects.map((entry) => entry.id)).toEqual(['p3', 'p2']);
    if (first.nextCursor === null) throw new Error('expected a second page');
    // p2 was the boundary entry and is edited before the next read.
    const after = [project('p3', 3), project('p2', 9), project('p1', 1)];
    const second = pageProjects(after, {
      ...everything,
      limit: 2,
      after: projectKeyOf(decodeCursor(first.nextCursor)),
    });
    expect(second.projects.map((entry) => entry.id)).toEqual(['p1']);
  });
});

describe('projectKeyOf', () => {
  test('reads the key it issued', () => {
    expect(projectKeyOf(decodeCursor(encodeCursor({ v: 1, k: [null, 'p'] })))).toEqual([null, 'p']);
  });

  test('refuses a cursor that is not a project cursor', () => {
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
      expect({ cursor, key: projectKeyOf(cursor) }).toEqual({ cursor, key: null });
  });
});
