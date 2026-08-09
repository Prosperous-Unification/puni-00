import { describe, expect, it } from 'bun:test';

import {
  addCalendarDays,
  addWorkdays,
  calendarDaysBetween,
  isIsoDate,
  isMonday,
  isWeekend,
  nextWorkday,
  workdaysBetween,
} from './workday';

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

describe('calendarDaysBetween', () => {
  it('counts every day between two dates, weekends among them', () => {
    // The one the Gantt's calendar scale is built on: Friday to Monday is three
    // days on a calendar and one on a workday axis.
    expect(calendarDaysBetween(FRIDAY, MONDAY)).toBe(3);
    expect(calendarDaysBetween(THURSDAY, THURSDAY)).toBe(0);
    // Backwards is a real answer here, unlike `workdaysBetween`: this counts
    // days rather than expressing a constraint that may only push later.
    expect(calendarDaysBetween(MONDAY, FRIDAY)).toBe(-3);
  });

  it('crosses a month and a year without drifting', () => {
    expect(calendarDaysBetween('2026-08-30', '2026-09-02')).toBe(3);
    expect(calendarDaysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('crosses a daylight-saving boundary as whole days', () => {
    // 2026-03-08 is the US spring-forward Sunday, so this pair is 47 hours
    // apart in New York and 48 in UTC. `TZ` is pinned around the assertion
    // because the fault this case exists for is only visible in a zone that has
    // a DST boundary here — see the `Proof:` on `calendarDaysBetween`.
    const zone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      expect(calendarDaysBetween('2026-03-07', '2026-03-09')).toBe(2);
    } finally {
      process.env.TZ = zone;
    }
  });

  it('refuses a string that is not a calendar date', () => {
    expect(() => calendarDaysBetween(THURSDAY, '2026-02-31')).toThrow(/not a calendar date/);
    expect(() => calendarDaysBetween('tomorrow', THURSDAY)).toThrow(/not a calendar date/);
  });
});

describe('addCalendarDays', () => {
  it('walks over the weekend rather than round it', () => {
    // The difference from `addWorkdays` in one line: this is the axis the Gantt
    // draws weekend columns on, so Friday plus one is the Saturday.
    expect(addCalendarDays(FRIDAY, 1)).toBe(SATURDAY);
    expect(addCalendarDays(FRIDAY, 3)).toBe(MONDAY);
    expect(addCalendarDays(THURSDAY, 0)).toBe(THURSDAY);
  });

  it('crosses a month and a year', () => {
    expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('inverts calendarDaysBetween', () => {
    for (const days of [0, 1, 7, 33, 400]) {
      expect(calendarDaysBetween(THURSDAY, addCalendarDays(THURSDAY, days))).toBe(days);
    }
  });
});

describe('isMonday', () => {
  it('is true on Monday alone', () => {
    expect([THURSDAY, FRIDAY, SATURDAY, SUNDAY].map(isMonday)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(isMonday(MONDAY)).toBe(true);
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
