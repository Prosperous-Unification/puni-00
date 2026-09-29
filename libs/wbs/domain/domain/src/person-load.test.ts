import { describe, expect, it } from 'bun:test';

import { overlapsOf, weeklyLoadOf } from './person-load';
import { addWorkdays, dateOfWorkdayOrdinal, workdayOrdinalOf } from './workday';

const span = (label: string, start: number, end: number) => ({ label, start, end });
const labels = (found: { bookings: readonly { label: string }[] }[]) =>
  found.map((overlap) => overlap.bookings.map((booking) => booking.label).sort());

describe('workday ordinals', () => {
  it('agree with addWorkdays for every offset from every day of a week', () => {
    for (const from of ['2026-10-05', '2026-10-08', '2026-10-10', '2026-10-11']) {
      for (let offset = 0; offset < 30; offset++) {
        expect(dateOfWorkdayOrdinal(workdayOrdinalOf(from) + offset)).toBe(
          addWorkdays(from, offset),
        );
      }
    }
  });

  it('put every Monday on a multiple of five, before the epoch too', () => {
    for (const monday of ['1969-12-22', '1969-12-29', '2026-10-05']) {
      expect(Math.abs(workdayOrdinalOf(monday) % 5)).toBe(0);
    }
    expect(workdayOrdinalOf('1969-12-23') - workdayOrdinalOf('1969-12-22')).toBe(1);
    expect(dateOfWorkdayOrdinal(workdayOrdinalOf('1969-12-23'))).toBe('1969-12-23');
  });

  it('read a weekend as the Monday after it', () => {
    expect(workdayOrdinalOf('2026-10-10')).toBe(workdayOrdinalOf('2026-10-12'));
  });

  it('refuse a fractional ordinal rather than rounding it', () => {
    expect(() => dateOfWorkdayOrdinal(1.5)).toThrow('whole workday');
  });
});

describe('overlapsOf', () => {
  it('reports nothing for touching bookings', () => {
    expect(overlapsOf([span('P', 0, 2), span('Q', 2, 4)])).toEqual([]);
  });

  it('reports an intersection of more than a point', () => {
    const found = overlapsOf([span('P', 0, 2.5), span('Q', 2, 4)]);
    expect(found.map(({ start, end }) => [start, end])).toEqual([[2, 2.5]]);
    expect(labels(found)).toEqual([['P', 'Q']]);
  });

  it('splits a chain into its maximal overlapping intervals', () => {
    const found = overlapsOf([span('P', 0, 3), span('Q', 2, 5), span('R', 4, 6)]);
    expect(found.map(({ start, end }) => [start, end])).toEqual([
      [2, 3],
      [4, 5],
    ]);
    expect(labels(found)).toEqual([
      ['P', 'Q'],
      ['Q', 'R'],
    ]);
  });

  it('names every booking active in one interval', () => {
    const found = overlapsOf([span('P', 0, 4), span('Q', 1, 3), span('R', 2, 5)]);
    expect(found.map(({ start, end }) => [start, end])).toEqual([[1, 4]]);
    expect(labels(found)).toEqual([['P', 'Q', 'R']]);
  });

  it('lets a span that holds no time join no overlap', () => {
    expect(overlapsOf([span('P', 0, 4), span('Q', 2, 2)])).toEqual([]);
  });

  it('ignores input order', () => {
    const forward = overlapsOf([span('P', 0, 3), span('Q', 2, 5)]);
    const backward = overlapsOf([span('Q', 2, 5), span('P', 0, 3)]);
    expect(backward.map(({ start, end }) => [start, end])).toEqual(
      forward.map(({ start, end }) => [start, end]),
    );
  });
});

describe('weeklyLoadOf', () => {
  it('counts the union of bookings and their overlaps per week', () => {
    // Two full-time bookings of one week (ordinals 0..5) and a half day of the next.
    const weeks = weeklyLoadOf([span('P', 0, 5), span('Q', 0, 5), span('R', 5, 5.5)], {
      start: 0,
      end: 10,
    });
    expect(weeks).toEqual([
      { weekOf: dateOfWorkdayOrdinal(0), booked: 5, overlapping: 5 },
      { weekOf: dateOfWorkdayOrdinal(5), booked: 0.5, overlapping: 0 },
    ]);
  });

  it('clips each week to the window', () => {
    const weeks = weeklyLoadOf([span('P', 0, 10)], { start: 3, end: 7 });
    expect(weeks).toEqual([
      { weekOf: dateOfWorkdayOrdinal(0), booked: 2, overlapping: 0 },
      { weekOf: dateOfWorkdayOrdinal(5), booked: 2, overlapping: 0 },
    ]);
  });

  it('answers an empty window with no weeks', () => {
    expect(weeklyLoadOf([span('P', 0, 10)], { start: 5, end: 5 })).toEqual([]);
  });
});
