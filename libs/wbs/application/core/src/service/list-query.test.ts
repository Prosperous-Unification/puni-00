import { describe, expect, test } from 'bun:test';

import { decodeCursor, encodeCursor, PAGE_LIMIT, pageQueryOf } from './list-query';

const url = (search: string) => new URL(`http://localhost/api/projects?${search}`);
const parsed = (search: string) =>
  pageQueryOf(Object.fromEntries(url(search).searchParams), url(search));
const base64url = (text: string) =>
  btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

describe('pageQueryOf', () => {
  test('takes the defaults when nothing is sent', () => {
    expect(parsed('')).toEqual({
      search: null,
      updatedSince: null,
      limit: PAGE_LIMIT.default,
      cursor: null,
    });
  });

  test('reads every parameter inside its grammar', () => {
    const cursor = encodeCursor({ v: 1, k: [5, 'p'] });
    expect(parsed(`q=%20Roof%20&updatedSince=1000&limit=200&cursor=${cursor}`)).toEqual({
      search: 'Roof',
      updatedSince: 1000,
      limit: 200,
      cursor: { v: 1, k: [5, 'p'] },
    });
    expect(parsed('limit=1')?.limit).toBe(1);
    expect(parsed('limit=007')?.limit).toBe(7);
  });

  test('refuses every value outside the grammar', () => {
    for (const search of [
      'limit=0',
      'limit=201',
      'limit=ten',
      'limit=1.5',
      'limit=',
      'limit=5&limit=6',
      'q=',
      'q=%20%20',
      `q=${'x'.repeat(201)}`,
      'updatedSince=-1',
      'updatedSince=1e3',
      'updatedSince=99999999999999999',
      'cursor=a+b/',
      // Padded standard base64 of `{"v":1}`: valid JSON, but not the base64url spelling.
      'cursor=eyJ2IjoxfQ%3D%3D',
      'cursor=',
      `cursor=${'a'.repeat(513)}`,
      'cursor=a',
      `cursor=${base64url('not json')}`,
      `cursor=${base64url('\xff\xfe')}`,
    ])
      expect({ search, parsed: parsed(search) }).toEqual({ search, parsed: null });
  });
});

describe('cursor codec', () => {
  test('round-trips a payload through base64url', () => {
    const payload = { v: 1 as const, k: [null, 'ü-project'] };
    const cursor = encodeCursor(payload);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual(payload);
  });
});
