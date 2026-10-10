import { expect, test } from 'bun:test';

import batch from './fixtures/batch-1.json';
import provenance from './fixtures/provenance.json';
import { candidatesAt, formatInstant, parseAttempts, placeAttempt, zoomViewport } from './model.js';

test('sanitized batch retains every separate attempt and pinned bytes', async () => {
  const bytes = await Bun.file(new URL('./fixtures/batch-1.json', import.meta.url)).arrayBuffer();
  expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(
    provenance.sanitizedSha256,
  );
  const attempts = parseAttempts(batch);
  expect(attempts).toHaveLength(31);
  expect(new Set(attempts.map((attempt) => attempt.id)).size).toBe(31);
  expect(attempts.every((attempt) => attempt.end !== null)).toBe(true);
  expect(
    attempts.reduce(
      (seconds, attempt) => seconds + (Number(attempt.end) - attempt.start) / 1000,
      0,
    ),
  ).toBe(19724);
  expect(Math.min(...attempts.map((attempt) => (Number(attempt.end) - attempt.start) / 1000))).toBe(
    112,
  );
  const repeated = Object.values(Object.groupBy(batch, (attempt) => attempt.packet)).find(
    (attempts) => attempts && attempts.length > 1,
  );
  expect(repeated).toBeDefined();
  if (!repeated) throw new Error('repeated real packet absent');
  expect(attempts.filter((attempt) => attempt.packet === repeated[0].packet)).toHaveLength(
    repeated.length,
  );
});

test('elapsed geometry and selected instant survive all scales within one CSS pixel', () => {
  const shortest = parseAttempts(batch).sort(
    (a, b) => Number(a.end) - a.start - (Number(b.end) - b.start),
  )[0];
  for (const width of [192, 1240]) {
    let viewport = { start: shortest.start - 200000, span: 86400000, width };
    for (const span of [604800000, 86400000, 21600000, 3600000, 900000, 300000]) {
      const before = placeAttempt(shortest, viewport).x;
      viewport = zoomViewport(viewport, span, shortest.start);
      const after = placeAttempt(shortest, viewport);
      expect(Math.abs(after.x - before)).toBeLessThanOrEqual(1);
      expect(after.width).toBeCloseTo((112000 / span) * width, 8);
    }
  }
});

test('explicit timezone offsets preserve instants; unzoned local times refuse', () => {
  const attempts = parseAttempts([
    {
      id: 'offset',
      packet: 'synthetic',
      slice: 'one',
      start: '2026-09-20T00:22:27+03:00',
      end: '2026-09-20T00:24:19+03:00',
    },
  ]);
  expect(attempts[0].start).toBe(Date.parse('2026-09-19T21:22:27Z'));
  expect(() =>
    parseAttempts([
      { id: 'local', packet: 'synthetic', slice: 'one', start: '2026-09-20T00:22:27', end: null },
    ]),
  ).toThrow('offset');
  for (const zone of ['UTC', 'Europe/Kyiv', 'Pacific/Auckland']) {
    expect(formatInstant(attempts[0].start, zone)).toContain('2026');
  }
});

test('repeated slices and identical starts remain separate; hit expansion exposes every candidate', () => {
  const attempts = parseAttempts([
    {
      id: 'first',
      packet: 'synthetic',
      slice: 'same',
      start: '2026-09-19T23:59:59Z',
      end: '2026-09-20T00:00:00Z',
    },
    {
      id: 'second',
      packet: 'synthetic',
      slice: 'same',
      start: '2026-09-19T23:59:59Z',
      end: '2026-09-20T00:00:00Z',
    },
    {
      id: 'touch',
      packet: 'synthetic',
      slice: 'same',
      start: '2026-09-20T00:00:00Z',
      end: '2026-09-20T00:00:01Z',
    },
  ]);
  expect(attempts).toHaveLength(3);
  const viewport = { start: attempts[0].start, span: 604800000, width: 1240 };
  expect(candidatesAt(attempts, viewport, 1).map((attempt: { id: string }) => attempt.id)).toEqual([
    'first',
    'second',
    'touch',
  ]);
});

test('zero duration and missing end stay distinct without an invented endpoint', () => {
  const attempts = parseAttempts([
    {
      id: 'zero',
      packet: 'synthetic',
      slice: 'zero',
      start: '2026-09-20T00:00:00Z',
      end: '2026-09-20T00:00:00Z',
    },
    { id: 'open', packet: 'synthetic', slice: 'open', start: '2026-09-20T00:00:00Z', end: null },
  ]);
  expect(attempts[0].end).toBe(attempts[0].start);
  expect(attempts[1].end).toBeNull();
  expect(
    placeAttempt(attempts[1], { start: attempts[0].start, span: 900000, width: 1000 }).width,
  ).toBeNull();
});

test('invalid, duplicate and reversed records refuse', () => {
  const valid = {
    id: 'one',
    packet: 'synthetic',
    slice: 'one',
    start: '2026-09-20T00:00:00Z',
    end: '2026-09-20T00:01:00Z',
  };
  expect(() => parseAttempts([valid, valid])).toThrow('duplicate');
  expect(() => parseAttempts([{ ...valid, end: '2026-09-19T23:59:59Z' }])).toThrow('reversed');
  expect(() => parseAttempts([{ ...valid, start: '2026-02-30T00:00:00Z' }])).toThrow('invalid');
  expect(() => parseAttempts([{ ...valid, start: '2026-09-20T25:00:00Z' }])).toThrow('invalid');
  expect(() => parseAttempts({ map: () => [] })).toThrow('attempt list');
  expect(() => parseAttempts([{ ...valid, id: '' }])).toThrow('identity');
});
