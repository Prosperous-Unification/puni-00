import { describe, expect, it } from 'bun:test';

import { addWorkdays, isIsoDate, isWeekend, nextWorkday, workdaysBetween } from './workday';

// 2026-08-06 is a Thursday; 08 and 09 are the Saturday and Sunday after it.
const THURSDAY = '2026-08-06';
const FRIDAY = '2026-08-07';
const SATURDAY = '2026-08-08';
const SUNDAY = '2026-08-09';
const MONDAY = '2026-08-10';

describe('isIsoDate', () => {
  it('accepts a real day and refuses everything else', () => {
    expect(isIsoDate(THURSDAY)).toBe(true);
    // Shape alone is not enough: `Date.parse` rolls this into March, so a
    // check that only tested the pattern would call it a day.
    expect(isIsoDate('2026-02-31')).toBe(false);
    for (const bad of ['2026-8-6', '06/08/2026', '', 'tomorrow', null, 20260806])
      expect(isIsoDate(bad)).toBe(false);
  });
});

describe('isWeekend', () => {
  it('is true on Saturday and Sunday only', () => {
    expect([THURSDAY, FRIDAY, MONDAY].map(isWeekend)).toEqual([false, false, false]);
    expect([SATURDAY, SUNDAY].map(isWeekend)).toEqual([true, true]);
  });
});

describe('nextWorkday', () => {
  it('leaves a workday alone and moves a weekend to Monday', () => {
    expect(nextWorkday(FRIDAY)).toBe(FRIDAY);
    expect(nextWorkday(SATURDAY)).toBe(MONDAY);
    expect(nextWorkday(SUNDAY)).toBe(MONDAY);
  });
});

describe('addWorkdays', () => {
  it('steps over the weekend', () => {
    expect(addWorkdays(THURSDAY, 1)).toBe(FRIDAY);
    // The one that matters: Friday plus one working day is Monday, not Saturday.
    expect(addWorkdays(FRIDAY, 1)).toBe(MONDAY);
    expect(addWorkdays(THURSDAY, 5)).toBe('2026-08-13');
  });

  it('starts a plan that begins on a weekend on the Monday', () => {
    expect(addWorkdays(SATURDAY, 0)).toBe(MONDAY);
  });

  it('floors a fractional offset — half a day is not half a date', () => {
    expect(addWorkdays(THURSDAY, 3.4)).toBe(addWorkdays(THURSDAY, 3));
  });

  it('refuses to walk backwards', () => {
    // Nothing happens before the plan's own start, and quietly counting into
    // last week is the kind of answer that reads as deliberate.
    expect(() => addWorkdays(THURSDAY, -1)).toThrow(/zero or more/);
  });

  it('crosses a month and a year without drifting', () => {
    // 2026-12-31 is a Thursday, so +1 workday is the Friday, +2 is Monday 4 Jan.
    expect(addWorkdays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addWorkdays('2026-12-31', 2)).toBe('2027-01-04');
  });
});

describe('workdaysBetween', () => {
  it('inverts addWorkdays for whole offsets', () => {
    for (const offset of [0, 1, 2, 5, 17, 40]) {
      expect(workdaysBetween(THURSDAY, addWorkdays(THURSDAY, offset))).toBe(offset);
    }
  });

  it('is zero for a date at or before the start', () => {
    // A constraint may only ever push a work item later, so a date before the
    // project's start is not a negative offset dragging the tree backwards.
    expect(workdaysBetween(MONDAY, THURSDAY)).toBe(0);
    expect(workdaysBetween(THURSDAY, THURSDAY)).toBe(0);
  });

  it('ignores the weekend between two dates', () => {
    expect(workdaysBetween(FRIDAY, MONDAY)).toBe(1);
  });
});
