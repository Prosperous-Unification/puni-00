import { dateOfWorkdayOrdinal } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { elsewhereFor, influencersOf, type RunningBookings } from './elsewhere-chain';

const peopleOf = (entries: Record<string, string[]>) =>
  new Map(Object.entries(entries).map(([id, people]) => [id, new Set(people)] as const));

const running = (entries: Record<string, [number, number, string][]>): RunningBookings =>
  new Map(
    Object.entries(entries).map(([person, bookings]) => [
      person,
      bookings.map(([start, end, projectId]) => ({ start, end, projectId, workItemId: 'w' })),
    ]),
  );

/** A workday ordinal a project can start on. */
const ANCHOR = 20_000;

describe('influencersOf', () => {
  it('reaches a project above through a shared person of another influencer', () => {
    // A above B above C; A and B share Ana, B and C share Ben.
    const order = ['a', 'b', 'c'];
    const people = peopleOf({ a: ['ana'], b: ['ana', 'ben'], c: ['ben'] });

    expect(influencersOf('c', order, people)).toEqual(['a', 'b']);
    expect(influencersOf('b', order, people)).toEqual(['a']);
    expect(influencersOf('a', order, people)).toEqual([]);
  });

  it('never reaches a project below, nor one sharing nobody', () => {
    const order = ['x', 'a', 'p', 'b'];
    const people = peopleOf({ x: ['kim'], a: ['ana'], p: ['ana'], b: ['ana'] });

    expect(influencersOf('p', order, people)).toEqual(['a']);
  });

  it('refuses a project its order does not hold', () => {
    expect(() => influencersOf('p', ['a'], peopleOf({ a: ['ana'] }))).toThrow(
      'not in its organization',
    );
  });
});

describe('elsewhereFor', () => {
  it("moves bookings into the project's own offsets, sorted, clamped at day 0", () => {
    expect(elsewhereFor(new Set(['ana']), new Map(), dateOfWorkdayOrdinal(ANCHOR)).size).toBe(0);

    const held = running({
      ana: [
        [ANCHOR + 5, ANCHOR + 7, 'b'],
        [ANCHOR, ANCHOR + 3, 'a'],
      ],
      ben: [[ANCHOR, ANCHOR + 1, 'a']],
    });
    const first = elsewhereFor(new Set(['ana']), held, dateOfWorkdayOrdinal(ANCHOR));
    expect(first.get('ana')).toEqual([
      { start: 0, end: 3, projectId: 'a', workItemId: 'w' },
      { start: 5, end: 7, projectId: 'b', workItemId: 'w' },
    ]);
    // Only the people this project names.
    expect(first.has('ben')).toBe(false);

    // Starting two workdays later, the first booking is clamped at day 0.
    const later = elsewhereFor(new Set(['ana']), held, dateOfWorkdayOrdinal(ANCHOR + 2));
    expect(later.get('ana')?.map(({ start, end }) => [start, end])).toEqual([
      [0, 1],
      [3, 5],
    ]);
    // Starting after both, nothing is left to place around.
    expect(elsewhereFor(new Set(['ana']), held, dateOfWorkdayOrdinal(ANCHOR + 7)).has('ana')).toBe(
      false,
    );
  });

  it('closes a drifted hand-off and refuses a real overlap', () => {
    const drifted = running({
      ana: [
        [ANCHOR, ANCHOR + 3, 'a'],
        [ANCHOR + 3 - 1e-12, ANCHOR + 4, 'b'],
      ],
    });
    expect(
      elsewhereFor(new Set(['ana']), drifted, dateOfWorkdayOrdinal(ANCHOR))
        .get('ana')
        ?.map(({ start, end }) => [start, end]),
    ).toEqual([
      [0, 3],
      [3, 4],
    ]);

    const overlapping = running({
      ana: [
        [ANCHOR, ANCHOR + 3, 'a'],
        [ANCHOR + 2, ANCHOR + 4, 'b'],
      ],
    });
    expect(() => elsewhereFor(new Set(['ana']), overlapping, dateOfWorkdayOrdinal(ANCHOR))).toThrow(
      'overlap across projects',
    );
  });
});
