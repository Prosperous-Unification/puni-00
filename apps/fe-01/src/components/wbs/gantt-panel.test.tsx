import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IsoDate } from '@wbs/domain/workday';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  Days,
  PersonView,
  ProjectApi,
  RoleView,
  SliceView,
  TeamView,
  WorkItemView,
} from '@/lib/wbs-api';

import type { GanttPlan, GanttRow, GanttSlice } from './gantt-geometry';
import {
  ASSUMED_UNESTIMATED_WORKDAYS,
  PERSON_BAR_COLORS,
  UNASSIGNED_BAR_COLOR,
} from './gantt-geometry';
import {
  assumedLabelFor,
  barLabelFor,
  barText,
  CHART_PAD_PX,
  DAY_PX,
  GanttPanel,
  initialsOf,
  monthWords,
  ROW_PX,
} from './gantt-panel';
import { type SubscriptionHandlers, WbsTable } from './wbs-table';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** A shown row: a leaf over these workdays, unless `extras` says otherwise. */
const rowAt = (
  id: string,
  earliestStart: number,
  earliestFinish: number,
  extras: Partial<GanttRow> = {},
): GanttRow => ({
  id,
  number: id,
  name: id,
  depth: 0,
  leaf: true,
  schedule: { earliestStart, earliestFinish },
  notBeforeOffset: null,
  ...extras,
});

/** A scheduled slice over these workdays, under the `dev` role. */
const sliceAt = (
  id: string,
  workItemId: string,
  earliestStart: number,
  earliestFinish: number,
  extras: Partial<GanttSlice> = {},
): GanttSlice => ({
  id,
  workItemId,
  roleId: 'dev',
  personId: null,
  duration: earliestFinish - earliestStart,
  estimated: true,
  earliestStart,
  earliestFinish,
  float: 0,
  critical: false,
  boundBy: 'projectStart',
  resourcePredecessorId: null,
  ...extras,
});

const planOf = (parts: Partial<GanttPlan>): GanttPlan => ({
  rows: [],
  slices: [],
  dependencies: [],
  roles: [{ id: 'dev', name: 'Dev' }],
  personNames: new Map(),
  ...parts,
});

const barFor = (sliceId: string): Element | null =>
  document.querySelector(`[data-gantt-bar="${sliceId}"]`);

/**
 * One attribute of one mark on the chart, or a sentence saying the mark is not
 * there at all.
 *
 * A sentence rather than `undefined` so that a deleted mark fails as a value
 * that is not the value expected. `expect(undefined).toContain(…)` fails as an
 * invalid **assertion** — the check does break, but on chai's own argument
 * checking rather than on anything about the chart, and the message names
 * neither the mark nor the day it should have been on. Watched, both ways,
 * 2026-08-09.
 */
const markAttribute = (selector: string, attribute: string): string =>
  document.querySelector(selector)?.getAttribute(attribute) ??
  `nothing on the chart at ${selector}`;

/**
 * The four numbers of the chart's `viewBox`, as numbers.
 *
 * A throw rather than zeroes for a chart that is not there: every assertion
 * about where a mark falls is relative to this box, and a box of zeroes would
 * make all of them pass against a chart nobody drew.
 */
function viewBoxOf(svg: Element | null): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const parts = svg?.getAttribute('viewBox')?.split(' ').map(Number);
  if (parts?.length !== 4) {
    throw new Error(`no viewBox on the chart: ${String(svg?.getAttribute('viewBox'))}`);
  }
  return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
}

const LAPTOP = 1024;
/** An iPhone 14's CSS width, the one `e2e/mobile.spec.ts` measures at. */
const PHONE = 390;

/** Sets the width the next render will read, before anything is on screen. */
function widthIs(width: number): void {
  (window as unknown as { innerWidth: number }).innerWidth = width;
}

beforeEach(() => {
  localStorage.clear();
  widthIs(LAPTOP);
});

afterEach(() => {
  cleanup();
  widthIs(LAPTOP);
});

/**
 * The Monday every calendar fixture in this file begins on.
 *
 * Every coordinate asserted against it is taken at an offset **past the first
 * weekend**, where the calendar number and the workday number differ. An
 * assertion at workday 3 passes unchanged on the axis this change replaced and
 * so proves nothing.
 */
const MONDAY_START = '2026-08-10';

/**
 * One mark's box on the chart, refused when it has no area.
 *
 * The sixteenth check's own lesson, made unskippable: an overlap comparison
 * against a mark of no width cannot fail, and the mark that had no width was an
 * unestimated bar. Every geometry assertion below goes through this, so a mark
 * that stopped being drawn fails as a mark that is not there rather than as a
 * comparison that quietly holds.
 *
 * @throws When the mark is not on the chart, or is drawn with no width or no
 * height.
 */
function drawnBox(selector: string): { x: number; width: number; y: number; height: number } {
  const mark = document.querySelector(selector);
  if (mark === null) throw new Error(`nothing on the chart at ${selector}`);
  const numberOf = (attribute: string): number => Number(mark.getAttribute(attribute));
  const box = {
    x: numberOf('x'),
    width: numberOf('width'),
    y: numberOf('y'),
    height: numberOf('height'),
  };
  if (!(box.width > 0) || !(box.height > 0)) {
    throw new Error(
      `${selector} is drawn with no area: ${String(box.width)}×${String(box.height)}`,
    );
  }
  return box;
}

/**
 * Every mark that carries a horizontal coordinate, on one plan, at one day.
 *
 * `sand` starts at workday 5 — the Monday after the plan's first weekend, seven
 * calendar days in — and is held there by a date of its own, waits on `strip`
 * across the weekend, and shares Kat with it. `trim` is estimated at no days on
 * the same workday, which is what draws a tick. `hull` spans the branch, so its
 * bracket ends at the end of workday 7.
 *
 * One fixture and one test on purpose: the eight marks are eight `map`s in the
 * SVG, and each of them can be reverted to its raw workday number on its own.
 * See the `Proof:` below.
 */
const everyMarkOnOneDay = (): GanttPlan =>
  planOf({
    rows: [
      rowAt('hull', 0, 7, { leaf: false }),
      rowAt('strip', 0, 5, { depth: 1 }),
      rowAt('sand', 5, 7, { depth: 1, notBeforeOffset: 5 }),
      rowAt('trim', 5, 5),
    ],
    slices: [
      sliceAt('strip-dev', 'strip', 0, 5, { personId: 'kat' }),
      sliceAt('sand-dev', 'sand', 5, 7, {
        personId: 'kat',
        boundBy: 'person',
        resourcePredecessorId: 'strip-dev',
      }),
      sliceAt('trim-dev', 'trim', 5, 5, { duration: 0 }),
    ],
    dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
    personNames: new Map([['kat', 'Kat']]),
  });

describe('every mark on the chart lands on the calendar day its workday is', () => {
  itDom('puts the bar, the caret, the tick, the axis cell and the label on day 7', () => {
    render(
      <GanttPanel
        plan={everyMarkOnOneDay()}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // Workday 5 is Monday 2026-08-17, and the chart is a calendar: seven days
    // in. Every mark below is on that one day, and each of them is drawn by a
    // block of its own that could be left reading the workday number.
    //
    // Proof, **eight faults, eight runs**, each mark reverted to its raw
    // workday number in turn and each watched failing this test alone —
    // `1 failed | 44 passed` every time. Watched 2026-08-09:
    //   bar          `x={bar.start}`              — `expected 5 to be 7`
    //   caret        `flag.workday`               — `expected 'M 5 2.03 L 5.285714285714286 2.09 L 5…' to match /^M 7 /`
    //   tick         `x1={bar.start}`             — `expected '5' to be '7'`
    //   label        `left: bar.start * DAY_PX`   — `expected 'color: rgb(255, …); left: 152p…' to contain 'left: 208px'`
    //   bracket      `chart.brackets`             — `expected 'M 0 0.5 L 0 0.18 L 7 0.18 L 7 0.5' to contain 'L 9 0.18'`
    //   arrow route  `arrow.toStart`              — `expected 'M 5 1.5 L 5.357142857142857 1.5 L 5.3…' to contain 'L 7 2.5'`
    //   arrow head   `arrow.toStart`              — `expected 'M 5 2.5 L 4.75 2.375 L 4.75 2.625 Z' to match /^M 7 /`
    //   person link  `chart.personLinks`          — `expected 'M 5 1.5 L 5 2.5' to be 'M 5 1.5 L 7 2.5'`
    const bar = drawnBox('[data-gantt-bar="sand-dev"]');
    expect(bar.x).toBe(7);
    // Two workdays with no weekend in them: the Monday and the Tuesday.
    expect(bar.width).toBe(2);
    expect(markAttribute('[data-gantt-not-before="2"]', 'd')).toMatch(/^M 7 /);
    expect(markAttribute('[data-gantt-tick="trim-dev"]', 'x1')).toBe('7');
    expect(
      document.querySelector('[data-gantt-bar-label="sand-dev"]')?.getAttribute('style'),
    ).toContain(`left: ${String(7 * DAY_PX + CHART_PAD_PX)}px`);

    // The axis cell above them, which is the mark that makes a mark left on
    // workdays visible: cell 7 is the Monday, and it is workday 5.
    expect(markAttribute('[data-axis-day="7"]', 'data-axis-date')).toBe('2026-08-17');
    expect(markAttribute('[data-axis-day="7"]', 'data-axis-workday')).toBe('5');

    // The parent's ghost bar ends at the end of workday 7, which is nine
    // calendar days in — its right edge is `x + width`, the rect's own reading
    // of the span the bracket path used to carry.
    const ghost = drawnBox('[data-gantt-bracket="hull"]');
    expect(ghost.x + ghost.width).toBe(9);

    // And the three marks joining two rows: the arrow leaves the Friday's right
    // edge at 5 and arrives at the Monday at 7, so the weekend is the gap.
    expect(markAttribute('[data-gantt-arrow="strip->sand"]', 'd')).toContain('L 7 2.5');
    expect(markAttribute('[data-gantt-arrow-head="strip->sand"]', 'd')).toMatch(/^M 7 /);
    expect(markAttribute('[data-gantt-person-link="strip-dev->sand-dev"]', 'd')).toBe(
      'M 5 1.5 L 7 2.5',
    );
  });

  itDom('refuses to compare a mark that has no area', () => {
    render(
      <GanttPanel
        plan={everyMarkOnOneDay()}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // `trim-dev` is estimated at no days, so its rect is the zero-width mark the
    // sixteenth check compared an overlap against and could not fail. The helper
    // every geometry assertion above goes through says so instead of measuring
    // it.
    //
    // Proof: the area guard in {@link drawnBox} removed — this test alone
    // failed, on `expected [Function] to throw an error`, and the box it handed
    // back was `{ x: 7, width: 0, … }`, which every overlap comparison in this
    // file would have held against. Watched 2026-08-09.
    expect(() => drawnBox('[data-gantt-bar="trim-dev"]')).toThrow(/drawn with no area/);
    expect(() => drawnBox('[data-gantt-bar="nobody-drew-this"]')).toThrow(/nothing on the chart/);
  });
});

/**
 * The reviewed coordinate contract, asserted where it can be (codex #15).
 *
 * Strict string equality against numbers written by hand into the fixture, not
 * `toBeCloseTo` and not a comparison against something recomputed here: the
 * whole point of a user space measured in workdays is that the engine's number
 * reaches the attribute untouched. A pixel would have to round.
 */
describe('the chart is drawn in calendar days', () => {
  itDom('puts a 3.5→6 slice at x=3.5 with a width of 4.5, and says so twice', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 3.5, 6)],
          slices: [sliceAt('strip-dev', 'strip', 3.5, 6, { duration: 2.5 })],
        })}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    const bar = barFor('strip-dev');
    // The fraction rides inside the workday it belongs to, so a slice 3.5
    // workdays in is still 3.5 calendar days in — the Thursday, half gone. It
    // works through the Friday and the Monday after, so its **drawn** width is
    // 4.5: the weekend it is on both sides of is drawn across.
    //
    // Proof: `x` computed as `bar.start * DAY_PX` and `width` as
    // `bar.duration * DAY_PX` — the pixel arithmetic design §1 rejects. This
    // test alone failed, on `expected '98' to be '3.5'`, and `data-start` went
    // on saying 3.5 beside it — exactly the drift the two-place contract exists
    // to catch. Watched, 2026-08-09.
    expect(bar?.getAttribute('x')).toBe('3.5');
    expect(bar?.getAttribute('width')).toBe('4.5');
    // And the engine's own numbers, untouched by the conversion above them.
    expect(bar?.getAttribute('data-start')).toBe('3.5');
    expect(bar?.getAttribute('data-finish')).toBe('6');
  });

  itDom('gives the SVG a user space of the calendar horizon by the rows', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 6)],
          slices: [sliceAt('strip-dev', 'strip', 0, 3), sliceAt('sand-dev', 'sand', 3, 6)],
        })}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    const svg = document.querySelector('[data-gantt-chart]');
    // Six workdays is eight calendar days once the weekend inside them is
    // drawn — plus the band the canvas keeps at either side for the marks that
    // step outside the schedule (see {@link CHART_PAD_PX}).
    const pad = CHART_PAD_PX / DAY_PX;
    expect(svg?.getAttribute('viewBox')).toBe(
      `${String(-pad)} 0 ${String(8 + 2 * pad)} ${String(2)}`,
    );
    // The band said in pixels, which is the unit it is decided in: the canvas
    // starts one band left of day 0 and ends one band past the horizon.
    // `toBeCloseTo` only because `-pad + 8 + 2·pad` is not exact in binary
    // floating point — the assertion is exact arithmetic, not a tolerance for
    // drift.
    const box = viewBoxOf(svg);
    expect(-box.minX * DAY_PX).toBeCloseTo(CHART_PAD_PX, 10);
    expect((box.minX + box.width - 8) * DAY_PX).toBeCloseTo(CHART_PAD_PX, 10);
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('none');

    // The axis holds one cell per calendar day of that band, counted against
    // the **canvas** rather than against a constant — and the two are computed
    // apart in the panel, from the axis's own length and from the horizon the
    // marks were placed against, which is what lets this assertion fail at all.
    //
    // Proof: the axis built from `chart.horizon` — the engine's six workdays —
    // while the canvas kept the calendar horizon. This test alone failed, on
    // `expected …(6) to have a length of 8 but got 6`: the axis two cells short
    // of the chart under it, and every date label two days right of the bar it
    // belongs to. Watched 2026-08-09. Watched **passing** first, with the
    // canvas sized from the axis's own count — a fault that moves both cannot
    // be seen by comparing them, which is why the canvas is not sized from the
    // axis.
    const cells = document.querySelectorAll('[data-axis-day]');
    expect(cells).toHaveLength(Math.ceil(box.width - 2 * pad));
    // Cell `k` stands at user-space `x = k`, which is what the gridline beside
    // it says: the two arrangements are one scale or they are two.
    expect([...cells].map((cell) => cell.getAttribute('data-axis-day'))).toEqual(
      [...document.querySelectorAll('[data-gantt-gridline]')].map((line) =>
        line.getAttribute('x1'),
      ),
    );
    // And the CSS width is the band through {@link DAY_PX}, so one user unit is
    // exactly one day of screen and the axis row above cannot be a different
    // width from the chart it labels.
    expect(svg?.getAttribute('width')).toBe(String(8 * DAY_PX + 2 * CHART_PAD_PX));
  });

  /**
   * The critical path is an outline, not a fill, because the fill is the
   * assignee — and this is the assertion that says the mark is present on the
   * critical bar and absent off it, which is the whole of the spec's "tinted
   * so".
   */
  itDom('rings the critical bar and leaves the other one alone', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 3), rowAt('sand', 0, 2)],
          slices: [
            sliceAt('strip-dev', 'strip', 0, 3, { critical: true, personId: 'kat' }),
            sliceAt('sand-dev', 'sand', 0, 2, { personId: 'kat' }),
          ],
          personNames: new Map([['kat', 'Kat']]),
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // The mark by name, not a `data-` attribute standing in for it: an attribute
    // could be right while the bar drew like every other one.
    //
    // Proof: `barClasses` returning '' for a critical bar — the `data-critical`
    // attribute still on it and the ring gone. This test alone failed, on
    // `expected false to be true`, and the browser gate's own selector went on
    // finding the bar. Watched, 2026-08-09.
    expect(barFor('strip-dev')?.classList.contains('stroke-foreground')).toBe(true);
    expect(barFor('sand-dev')?.classList.contains('stroke-foreground')).toBe(false);
    // And both keep Kat's colour: the critical path costs the reader nothing
    // about who is on it.
    expect(barFor('strip-dev')?.getAttribute('fill')).toBe(PERSON_BAR_COLORS[0]);
    expect(barFor('sand-dev')?.getAttribute('fill')).toBe(PERSON_BAR_COLORS[0]);
  });

  itDom('paints a bar in its person’s colour, and an unassigned one grey', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 3), rowAt('sand', 0, 2), rowAt('trim', 0, 2)],
          slices: [
            sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat' }),
            sliceAt('sand-dev', 'sand', 0, 2, { personId: 'ravi' }),
            sliceAt('trim-dev', 'trim', 0, 2),
          ],
          personNames: new Map([
            ['kat', 'Kat'],
            ['ravi', 'Ravi'],
          ]),
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // Proof: `fill={bar.estimated ? bar.personColor : 'none'}` replaced by
    // `fill="currentColor"` — every bar one colour, which is what the chart
    // looked like before this change. **Three** tests failed and the run said
    // `3 failed | 22 passed`: this one and `rings the critical bar…` on
    // `expected 'currentColor' to be '#1f77b4'`, and `draws an unestimated
    // slice hollow…` on `expected 'currentColor' to be 'none'` — the hollow
    // bar filled in as well, which only that third test can see. Watched,
    // 2026-08-09.
    expect(barFor('strip-dev')?.getAttribute('fill')).toBe(PERSON_BAR_COLORS[0]);
    expect(barFor('sand-dev')?.getAttribute('fill')).toBe(PERSON_BAR_COLORS[1]);
    expect(barFor('trim-dev')?.getAttribute('fill')).toBe(UNASSIGNED_BAR_COLOR);
  });

  /**
   * The ghost bar: an unestimated slice drawn across the assumed span, and
   * drawn so nobody reads it as a schedule.
   *
   * Both marks together, because either alone is a bar that lies. Two workdays
   * at full strength is an estimate nobody made; two workdays with no fill is
   * an outline of an estimate nobody made.
   */
  itDom('draws an unestimated slice as a translucent, dashed bar of the assumed span', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 3), rowAt('sand', 4, 4)],
          slices: [
            sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat' }),
            sliceAt('sand-dev', 'sand', 4, 4, { estimated: false, personId: 'kat' }),
          ],
          personNames: new Map([['kat', 'Kat']]),
        })}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    const ghost = barFor('sand-dev');
    // Proof: `ASSUMED_BAR_CLASSES` emptied to `''`, so an unestimated bar drew
    // in Kat's solid colour at the assumed width — the worst of the two, a
    // guess that reads as a schedule. This test alone failed, on `expected
    // false to be true`, and `keeps the assumed span out of the engine's own
    // numbers` beside it went on passing: it is the width that test watches and
    // the paint this one does. Watched, 2026-08-09.
    expect(ghost?.classList.contains('[fill-opacity:0.35]')).toBe(true);
    expect(ghost?.classList.contains('[stroke-dasharray:3_2]')).toBe(true);
    // Kat's colour either way: the bar says "guessed", never "nobody's".
    expect(ghost?.getAttribute('fill')).toBe(PERSON_BAR_COLORS[0]);
    // The assumed span is two **workdays**, and this one stands on the Friday:
    // four calendar days wide, because the weekend it is drawn over is drawn.
    // The two numbers are deliberately different here — a fixture where they
    // agreed would pass on the axis this change replaced.
    expect(ghost?.getAttribute('width')).toBe('4');
    expect(ASSUMED_UNESTIMATED_WORKDAYS).toBe(2);
    expect(ghost?.getAttribute('data-assumed')).toBe('true');

    // And an estimated bar carries none of it — without this the two assertions
    // above would pass against a chart where every bar is a ghost.
    const real = barFor('strip-dev');
    expect(real?.classList.contains('[fill-opacity:0.35]')).toBe(false);
    expect(real?.classList.contains('[stroke-dasharray:3_2]')).toBe(false);
    expect(real?.getAttribute('data-assumed')).toBeNull();
  });

  itDom('draws the width it is given and says the numbers it was sent', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('sand', 3, 3), rowAt('trim', 3, 5)],
          slices: [
            sliceAt('sand-dev', 'sand', 3, 3, { estimated: false }),
            sliceAt('trim-dev', 'trim', 3, 5),
          ],
        })}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // The drawn width is the assumption — two workdays from the Thursday, which
    // is the Thursday and the Friday and so two calendar days — while
    // `data-start` and `data-finish` are what be-01 said, and they are equal.
    //
    // Proof: the width taken as `endOf(bar.finish) − startOf(bar.start)`,
    // which is codex 14's fault: an unestimated slice finishes where it starts.
    // This test alone failed, on `expected '0' to be '2'` — a bar of no area at
    // all, and every estimated case beside it stayed green. Watched 2026-08-09.
    expect(barFor('sand-dev')?.getAttribute('width')).toBe('2');
    expect(barFor('sand-dev')?.getAttribute('data-start')).toBe('3');
    expect(barFor('sand-dev')?.getAttribute('data-finish')).toBe('3');

    // And an estimated 3 → 5 stops at the Friday rather than running on to the
    // Monday its successor would start at: two days, no weekend tail.
    expect(barFor('trim-dev')?.getAttribute('x')).toBe('3');
    expect(barFor('trim-dev')?.getAttribute('width')).toBe('2');
  });

  itDom('writes the guess on the ghost bar, and the person with it', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('sand', 3, 3), rowAt('trim', 3, 3)],
          slices: [
            sliceAt('sand-dev', 'sand', 3, 3, { estimated: false, personId: 'kat' }),
            sliceAt('trim-dev', 'trim', 3, 3, { estimated: false }),
          ],
          personNames: new Map([['kat', 'Kat']]),
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // Proof: the `assumedLabelFor` branch reverted to the old `bar.estimated ?
    // barLabelFor(…) : null` — no ghost writes anything. This test alone
    // failed, on `expected undefined to be 'Kat · ?'`, and the chart carried two
    // bars of guessed width with nothing on them saying so. Watched,
    // 2026-08-09.
    expect(document.querySelector('[data-gantt-bar-label="sand-dev"]')?.textContent).toBe(
      'Kat · ? · sand - sand',
    );
    // Nobody on it: the `?` is still the point and is still written, the row
    // words after it.
    expect(document.querySelector('[data-gantt-bar-label="trim-dev"]')?.textContent).toBe(
      '? · trim - trim',
    );
  });

  /**
   * A slice **estimated** at no days is drawn by a tick, because a
   * `<rect width="0">` paints nothing at all and the row would read as empty.
   * `expectedDays({0, 0, 0})` is 0, so this is a real answer and not the
   * unestimated one — which now has a bar of its own and no tick.
   */
  itDom('marks a zero-day estimate with a tick where it starts, and a ghost with none', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 3), rowAt('sand', 5, 5), rowAt('trim', 5, 5)],
          slices: [
            sliceAt('strip-dev', 'strip', 0, 3),
            sliceAt('sand-dev', 'sand', 5, 5, { duration: 0 }),
            sliceAt('trim-dev', 'trim', 5, 5, { estimated: false }),
          ],
        })}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // Workday 5 is the Monday past the weekend, seven calendar days in — and
    // the zero-day estimate keeps its zero width there rather than being drawn
    // backwards to the Friday's edge, which is what a finish reading of a span
    // of no days would give.
    //
    // Proof: the tick block's `filter((bar) => bar.drawnSpan === 0)` turned off
    // (`filter(() => false)`), so no tick is drawn at all. This test alone
    // failed, on `expected 'nothing on the chart at [data-gantt-t…' to be '7'`
    // — the zero-day bar still in the DOM as a rect of no width, painting
    // nothing. Re-watched 2026-08-09 in this shape.
    expect(markAttribute('[data-gantt-tick="sand-dev"]', 'x1')).toBe('7');
    expect(barFor('sand-dev')?.getAttribute('width')).toBe('0');
    expect(document.querySelector('[data-gantt-tick="strip-dev"]')).toBeNull();
    // The unestimated slice on the same workday is two workdays wide; a tick
    // under it would be the old mark left behind on a bar that no longer needs
    // one, and its width says the two are not the same fact.
    expect(barFor('trim-dev')?.getAttribute('width')).toBe('2');
    expect(document.querySelector('[data-gantt-tick="trim-dev"]')).toBeNull();
  });

  itDom('says everything it knows in a title nothing scales, floor last', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 2, 5, { number: '010', name: 'Strip the hull' })],
          slices: [
            sliceAt('strip-dev', 'strip', 2, 5, {
              boundBy: 'predecessor',
              personId: 'kat',
              float: 1.5,
            }),
          ],
          personNames: new Map([['kat', 'Kat']]),
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // One fact to a line, and the binding floor last — the sentence the panel
    // was built to show is where a reader's eye ends.
    expect(barFor('strip-dev')?.querySelector('title')?.textContent.split('\n')).toEqual([
      '010 - Strip the hull',
      'Dev · Kat',
      'Workdays 2 → 5 · 3 days',
      'Float 1.5 days',
      'Waits for a dependency to finish',
    ]);
  });

  itDom('says on the ghost bar that its width is a drawing and not an estimate', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('sand', 3, 3, { number: '020', name: 'Sand the deck' })],
          slices: [sliceAt('sand-dev', 'sand', 3, 3, { estimated: false })],
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // A line of its own, between the dates and the float, so it is read rather
    // than found.
    //
    // Proof: the line dropped from `barWords` — this test alone failed, on
    // `expected [ '020 - Sand the deck', …(4) ] to deeply equal [ '020 - Sand
    // the deck', …(5) ]`, and the only thing left saying
    // the two days were invented was the bar's own paint. Watched, 2026-08-09.
    expect(barFor('sand-dev')?.querySelector('title')?.textContent.split('\n')).toEqual([
      '020 - Sand the deck',
      'Dev · Unassigned',
      'Workdays 3 → 3 · not estimated',
      'Not estimated — drawn as 2 days',
      'Float 0 days',
      'Starts with the project',
    ]);
  });

  itDom('says a fraction in prose to two places, and draws it whole', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 5, 8.666666666666666)],
          slices: [
            sliceAt('strip-dev', 'strip', 5, 8.666666666666666, {
              duration: 3.6666666666666665,
              critical: true,
            }),
          ],
        })}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    const bar = barFor('strip-dev');
    // The prose rounds and the drawing does not — the one place in this panel
    // where a schedule number is not carried verbatim.
    expect(bar?.querySelector('title')?.textContent).toContain('3.67 days');
    expect(bar?.querySelector('title')?.textContent).toContain('On the critical path');
    // The fraction survives the scale: the bar starts at the Monday, seven
    // calendar days in, and is drawn the whole three-and-two-thirds of it
    // rather than the two places the sentence above prints.
    expect(bar?.getAttribute('x')).toBe('7');
    expect(bar?.getAttribute('width')).not.toBe('3.67');
    expect(Number(bar?.getAttribute('width'))).toBeCloseTo(3.6666666666666665, 12);
  });

  itDom('draws every other mark the geometry placed, in the same calendar days', () => {
    render(
      <GanttPanel
        plan={everyMarkOnOneDay()}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // Four marks no assertion about a bar can see, each of them a `map` in the
    // SVG that could be deleted whole without a bar moving. Where each of them
    // stands is `every mark on the chart lands on the calendar day its workday
    // is`; that they are drawn at all is here.
    //
    // Proof: the four blocks deleted one at a time, a run apiece. Each deletion
    // failed this test and only this test, and the sentence stood in for the
    // missing mark every time (vitest abbreviates the selector in its summary
    // line):
    //   bracket — `expected 'nothing on the chart at [data-gantt-b…' to be '9'`
    //   (re-watched 2026-08-09 as a rect: the block deleted, this test alone)
    //   arrow   — `expected 'nothing on the chart at [data-gantt-a…' to contain 'M 5 1.5'`
    //   link    — `expected 'nothing on the chart at [data-gantt-p…' to contain '[stroke-dasharray:4_3]'`
    //   flag    — `expected 'nothing on the chart at [data-gantt-n…' to match /^M 7 /`
    // Watched, 2026-08-09.
    // An existence check and nothing more, deliberately: the ghost bar's whole
    // shape — inset, height, radii, translucent fill — is asserted in `the
    // marks that had to be seen`, where the relation to a leaf's bar is the
    // assertion. Here it is drawn at all, spanning its nine calendar days.
    expect(markAttribute('[data-gantt-bracket="hull"]', 'width')).toBe('9');
    expect(markAttribute('[data-gantt-arrow="strip->sand"]', 'd')).toContain('M 5 1.5');
    // Dashed and its own colour: a hand-off is not a dependency, and the two
    // are told apart by nothing but how they are drawn.
    expect(markAttribute('[data-gantt-person-link="strip-dev->sand-dev"]', 'class')).toContain(
      '[stroke-dasharray:4_3]',
    );
    // And in Kat's colour, the same one her two bars are painted: the line and
    // its ends are one queue rather than a third kind of edge.
    //
    // Proof: the link's `stroke` left off, so it fell back to the SVG's
    // `currentColor` like every other line. Failed on `expected 'nothing on the
    // chart at [data-gantt-p…' to be '#1f77b4'`. Watched, 2026-08-09.
    expect(markAttribute('[data-gantt-person-link="strip-dev->sand-dev"]', 'stroke')).toBe(
      PERSON_BAR_COLORS[0],
    );
    // The flag is drawn, on its own row, at the day the calendar puts it.
    //
    // Proof: the flag's `d` built from `flag.rowIndex` instead of its `x` —
    // the mark still drawn, on the right row, at the wrong day. Failed on
    // `expected 'M 2 2.03 L 7.285714285714286 2.09 L 7…' to match /^M 7 /`.
    // Watched, 2026-08-09.
    expect(markAttribute('[data-gantt-not-before="2"]', 'd')).toMatch(/^M 7 /);
  });

  itDom('draws nothing at all while the dependencies run in a circle', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 3)],
          // be-01 sends none of these with a cycle. The fixture carries one
          // anyway, so this is the panel refusing to draw rather than an empty
          // payload drawing nothing.
          slices: [sliceAt('strip-dev', 'strip', 0, 3)],
        })}
        startDate={null}
        scheduleError="cycle"
        onPickRow={() => undefined}
      />,
    );

    expect(document.querySelectorAll('rect')).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('run in a circle');
  });
});

/**
 * The three marks a live Chrome could not see, asserted as shapes.
 *
 * All three were drawn, all three were gated, and all three were invisible on
 * screen: a 1px headless elbow that collapsed onto the successor's own left
 * edge whenever a dependency was tight, a not-before flag painted **under** the
 * bar it belongs to, and a hairline bracket that read as a scratch. Nothing in
 * this file could see any of it, because every one of them draws the mark — the
 * fault was where the mark was, and how heavy.
 *
 * So these assertions are about the **relations between points**, not about
 * path text: the head arrives left of the bar it points at, the caret's whole
 * box is above the bar's top edge, the bracket's ends fall from its line. The
 * pixels are `e2e/gantt.spec.ts`'s, and the two halves are named in each
 * `Proof:` below.
 */
describe('the marks that had to be seen', () => {
  /**
   * The points of a path's `d`, in the user space the chart is drawn in.
   *
   * @throws When the path is not there, or holds no point at all — either of
   * which would otherwise make every assertion below vacuously true of an empty
   * list.
   */
  function pointsOf(selector: string): { x: number; y: number }[] {
    const d = document.querySelector(selector)?.getAttribute('d');
    if (d === null || d === undefined) throw new Error(`nothing on the chart at ${selector}`);
    const points = [...d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
    }));
    if (points.length === 0) throw new Error(`the path at ${selector} has no points: ${d}`);
    return points;
  }

  /** One number off a mark, as the browser will read it. */
  function attributeNumber(selector: string, attribute: string): number {
    const raw = document.querySelector(selector)?.getAttribute(attribute);
    if (raw === null || raw === undefined) {
      throw new Error(`nothing on the chart at ${selector} carries ${attribute}`);
    }
    return Number(raw);
  }

  /**
   * A parent over two leaves, the second of which starts the workday the first
   * finishes and is held there by a date of its own.
   *
   * The tight case on purpose: `sand` starts at 8 and `strip` finishes at 8, so
   * the arrow has no room, and `sand`'s not-before offset is 8 as well, so the
   * caret and the bar's left edge are the same x. Both are the commonest shape
   * in a real plan and both are the shape the old drawing lost.
   *
   * Every offset is past the plan's first weekend and none of them has one
   * inside it, which is what keeps the two bars **touching** on a calendar
   * while every coordinate below differs from its workday number: workday 8 is
   * Thursday 2026-08-20, ten calendar days in.
   */
  const touchingPlan = (): GanttPlan =>
    planOf({
      rows: [
        rowAt('hull', 5, 10, { leaf: false }),
        rowAt('strip', 5, 8, { depth: 1 }),
        rowAt('sand', 8, 10, { depth: 1, notBeforeOffset: 8 }),
      ],
      slices: [sliceAt('strip-dev', 'strip', 5, 8), sliceAt('sand-dev', 'sand', 8, 10)],
      dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
    });

  /** Where the two bars of {@link touchingPlan} meet, on the calendar. */
  const TOUCH_AT = 10;

  const drawTouchingPlan = (startDate: IsoDate = MONDAY_START): void => {
    render(
      <GanttPanel
        plan={touchingPlan()}
        startDate={startDate}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );
  };

  itDom('leaves the successor’s left edge alone when the two bars touch', () => {
    drawTouchingPlan();

    const route = pointsOf('[data-gantt-arrow="strip->sand"]');
    const last = route.at(-1);
    const beforeLast = route.at(-2);
    // Proof: `arrowRoute` given back its old three points — `M fromX, fromY L
    // toX, fromY L toX, toY`. With `toX === fromX` those collapse to a bare
    // vertical **on** the successor's left edge, at 1px, under the bar and
    // under a critical ring: the arrow this repository shipped and nobody could
    // see. This test alone failed, on `the arrow arrives from above the
    // successor’s left edge, not from outside it: expected 10 to be less than
    // 10`. Re-watched 2026-08-09 on the calendar.
    expect(last).toEqual({ x: TOUCH_AT, y: 2.5 });
    expect(
      beforeLast?.x ?? Number.NaN,
      'the arrow arrives from above the successor’s left edge, not from outside it',
    ).toBeLessThan(TOUCH_AT);
    // And it got there by stepping past the predecessor's right edge rather
    // than by running down the shared edge: something in the route is to the
    // right of the touching point.
    expect(Math.max(...route.map((point) => point.x))).toBeGreaterThan(TOUCH_AT);
    // And it is drawn heavily enough to be one of the marks rather than an
    // artefact of the gridlines it crosses. What 1.5 actually measures is
    // `e2e/gantt.spec.ts`'s to say; jsdom computes no style at all.
    //
    // Proof: `[stroke-width:1.5]` struck from the class, leaving the 1px
    // hairline. This test alone failed, `1 failed | 30 passed`, on `expected
    // 'stroke-foreground fill-none' to contain '[stroke-width:1.5]'`. Watched
    // 2026-08-09.
    expect(
      document.querySelector('[data-gantt-arrow="strip->sand"]')?.getAttribute('class'),
    ).toContain('[stroke-width:1.5]');
  });

  itDom('points a filled head at the successor’s start', () => {
    drawTouchingPlan();

    const head = pointsOf('[data-gantt-arrow-head="strip->sand"]');
    // Proof: the `<path data-gantt-arrow-head>` deleted from the SVG, which is
    // the whole of what "an arrow with no arrowhead" is. This test alone failed
    // — `1 failed | 30 passed` — on `Error: nothing on the chart at
    // [data-gantt-arrow-head="strip->sand"]`, thrown by `pointsOf` rather than
    // asserted as `undefined`, so the message names the mark. Watched
    // 2026-08-09.
    expect(head.at(0)).toEqual({ x: TOUCH_AT, y: 2.5 });
    // A triangle whose base is behind its point: both other corners are left of
    // the successor's edge, so the head sits in the approach and not on the bar.
    expect(head.slice(1).every((corner) => corner.x < TOUCH_AT)).toBe(true);
    expect(document.querySelector('[data-gantt-arrow-head]')?.getAttribute('class')).toContain(
      'fill-foreground',
    );
  });

  itDom('puts the not-before caret clear of the bar that starts on it', () => {
    drawTouchingPlan();

    // The bar's own top edge, read off the rect rather than recomputed: what is
    // being asserted is that the caret is above **this bar as drawn**, and a
    // constant repeated here could go on agreeing with a bar that moved.
    const barTop = attributeNumber('[data-gantt-bar="sand-dev"]', 'y');
    const caret = pointsOf('[data-gantt-not-before="2"]');
    // Proof: the caret's `d` put back where it was — `M offset,BAR_INSET L
    // offset+0.35,BAR_INSET L offset,ROW_MIDDLE Z`, a triangle hanging off the
    // bar's own top-left corner, drawn before the bars and therefore painted
    // over by this one. This test alone failed, `1 failed | 30 passed`, on `the
    // caret is not clear of the bar it belongs to: expected 2.18 to be less
    // than 2.18`. Watched 2026-08-09.
    expect(caret).toHaveLength(3);
    for (const corner of caret) {
      expect(corner.y, 'the caret is not clear of the bar it belongs to').toBeLessThan(barTop);
      expect(corner.y).toBeGreaterThan(2);
    }
    // And it stands at the calendar day the bar starts on, not somewhere near
    // it and not at the workday number 8 the date was stored as.
    expect(Math.min(...caret.map((corner) => corner.x))).toBe(TOUCH_AT);
    expect(attributeNumber('[data-gantt-bar="sand-dev"]', 'data-start')).toBe(8);
  });

  itDom('says which date the caret is holding the row at', () => {
    drawTouchingPlan();

    // The **date**, worked out from the workday the row was held at and never
    // from where the caret stands: the caret is at calendar day 10 and the day
    // it names is Thursday 2026-08-20, which is workday 8. A sentence read off
    // the coordinate would name 2026-08-24.
    //
    // Proof: the `<title>` child emptied on the caret. This test alone failed,
    // on `expected '' to be 'No earlier than 2026-08-20'` — a mark that says
    // where and never what. Watched 2026-08-09.
    expect(document.querySelector('[data-gantt-not-before="2"] title')?.textContent).toBe(
      'No earlier than 2026-08-20',
    );
  });

  itDom('still marks a parent whose projection has no days', () => {
    // Every child unestimated, so the branch's projection starts and finishes
    // on one workday — a modeled state the seeded ustsu plan is full of. The
    // ghost rect would have zero width there, which is no mark at all; the
    // parent gets the leaves' own answer, a tick where the branch stands.
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('hull', 5, 5, { leaf: false }), rowAt('strip', 5, 5, { depth: 1 })],
          slices: [sliceAt('strip-dev', 'strip', 5, 5, { duration: 0, estimated: false })],
        })}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );
    const mark = document.querySelector('[data-gantt-bracket="hull"]');
    if (mark === null) throw new Error('the zero-span parent left no mark at all');
    expect(mark.tagName).toBe('line');
    // On the calendar: workday 5 of a Monday start is seven days in, and the
    // tick spans the bar band rather than being a point.
    expect(mark.getAttribute('x1')).toBe('7');
    expect(mark.getAttribute('x2')).toBe('7');
    expect(Number(mark.getAttribute('y2')) - Number(mark.getAttribute('y1'))).toBeCloseTo(0.64, 12);
  });

  itDom('draws a parent as the ghost of a bar: a leaf’s shape, translucent, unstroked', () => {
    drawTouchingPlan();

    // The same shape the leaf bar beside it has — inset, height, both corner
    // radii — read off the two rects rather than written out, so the "same
    // bar as other bars" claim is the assertion and not a comment.
    const ghost = drawnBox('[data-gantt-bracket="hull"]');
    const leaf = drawnBox('[data-gantt-bar="strip-dev"]');
    expect(ghost.y - Math.floor(ghost.y)).toBeCloseTo(leaf.y - Math.floor(leaf.y), 12);
    expect(ghost.height).toBe(leaf.height);
    const attributeOf = (selector: string, attribute: string): string | null =>
      document.querySelector(selector)?.getAttribute(attribute) ?? null;
    // Not-null before equal: two rects that both lost their radii would agree
    // on null, and `expect(null).toBe(null)` is a check that cannot fail.
    expect(attributeOf('[data-gantt-bracket="hull"]', 'rx')).not.toBeNull();
    expect(attributeOf('[data-gantt-bracket="hull"]', 'rx')).toBe(
      attributeOf('[data-gantt-bar="strip-dev"]', 'rx'),
    );
    expect(attributeOf('[data-gantt-bracket="hull"]', 'ry')).toBe(
      attributeOf('[data-gantt-bar="strip-dev"]', 'ry'),
    );
    // The span is the projection on the calendar: hull runs workdays 5 → 10,
    // which is calendar days 7 → 12 across the middle weekend.
    expect(ghost.x).toBe(7);
    expect(ghost.width).toBe(5);
    // Translucent foreground and no stroke: visibly a projection of the rows
    // beneath it, not an eleventh person's work.
    //
    // Proof: the class replaced by `fill-foreground` whole — a parent drawn as
    // solid ink, indistinguishable from work. This test alone failed, on
    // `expected 'fill-foreground' to contain 'fill-foreground/15'`. Watched
    // 2026-08-09.
    const paint = attributeOf('[data-gantt-bracket="hull"]', 'class') ?? '';
    expect(paint).toContain('fill-foreground/15');
    expect(paint).not.toContain('stroke');
  });
});

/**
 * The words on the chart, which are all of them HTML.
 *
 * Design §1: the SVG's user space is non-uniformly scaled, so a `<text>` in it
 * would be a stretched glyph. Every label is a span positioned by the same
 * `DAY_PX`/`ROW_PX` the SVG is sized by — which is the arithmetic these tests
 * recompute rather than write pixel numbers for.
 */
/**
 * The canvas holds every mark the chart draws.
 *
 * The marks are not all inside the engine's numbers, and two of them are
 * routinely outside: a dependency arrow steps clear of a bar before it turns,
 * so a successor at workday 0 routes through negative x, and the same arrow off
 * the last bar routes past the horizon. The viewBox used to be `0 0 horizon
 * rows`, and a browser's own `overflow: hidden` on an `<svg>` clipped both —
 * measured in Chromium at **0 painted pixels** for the head of a left-edge
 * arrow, while `getBoundingClientRect` went on reporting the box it would have
 * had. That is why the browser half of this lives in `e2e/gantt.spec.ts`: a
 * clipped path still measures.
 *
 * What jsdom can hold is the arithmetic — that every x the chart draws at is
 * inside the box it declares.
 */
describe('the canvas holds every mark it draws', () => {
  /**
   * A plan whose one arrow runs off **both** ends of the schedule.
   *
   * `sand` is unestimated, so it sits at workday 0 and the dependency from
   * `strip` — which finishes at the horizon — has to come back to it: the route
   * leaves past the last day and arrives from left of the first. The commonest
   * shape there is, since an unestimated row is where every plan starts.
   *
   * `strip` runs 0 → 6, so the schedule crosses a weekend and the canvas is
   * eight calendar days rather than six workdays: a fixture inside one week
   * would hold whether the canvas were the calendar's or the engine's.
   */
  const routeOffBothEnds = (): GanttPlan =>
    planOf({
      rows: [rowAt('strip', 0, 6), rowAt('sand', 0, 0, { notBeforeOffset: 6 })],
      slices: [
        sliceAt('strip-dev', 'strip', 0, 6),
        sliceAt('sand-dev', 'sand', 0, 0, { duration: 0, estimated: false }),
      ],
      dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
    });

  /**
   * Every x the chart draws at: the points of every path, and both edges of
   * every bar.
   *
   * @throws When the chart drew nothing, which would make a claim about "every
   * mark" a claim about none.
   */
  function everyDrawnX(): number[] {
    const drawn = [...document.querySelectorAll('[data-gantt-chart] path')].flatMap((mark) =>
      [...(mark.getAttribute('d') ?? '').matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((point) =>
        Number(point[1]),
      ),
    );
    const bars = [...document.querySelectorAll('[data-gantt-bar]')].flatMap((bar) => {
      const x = Number(bar.getAttribute('x'));
      return [x, x + Number(bar.getAttribute('width'))];
    });
    const xs = [...drawn, ...bars];
    if (xs.length === 0) throw new Error('the chart drew no marks to measure');
    return xs;
  }

  itDom('declares a canvas wide enough for a route that leaves the schedule', () => {
    render(
      <GanttPanel
        plan={routeOffBothEnds()}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    const xs = everyDrawnX();
    // The fixture really does route outside the schedule, at both ends. Without
    // these two the assertions below would hold of a chart nothing ever left,
    // which is the shape of check R5 exists to stop. Eight, because six
    // workdays over a weekend is eight calendar days — the number the canvas
    // has to reach past.
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(8);

    // Proof: the viewBox put back to `0 0 horizon rowCount` and the width to
    // `horizon * DAY_PX`. This test alone failed, on `expected
    // -0.35714285714285715 to be greater than or equal to 0` — the arrow's
    // approach, a third of a day left of a canvas that started at 0, which is
    // where Chromium painted nothing at all. Watched 2026-08-09.
    const box = viewBoxOf(document.querySelector('[data-gantt-chart]'));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(box.minX);
    expect(Math.max(...xs)).toBeLessThanOrEqual(box.minX + box.width);
  });

  itDom('keeps the bars on the engine’s numbers while the canvas grows', () => {
    render(
      <GanttPanel
        plan={routeOffBothEnds()}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // The canvas's edges are not the schedule's, and neither is the calendar:
    // `data-finish` is the engine's sixth **workday** while the bar is drawn
    // across eight calendar days, and a wider box moves neither.
    expect(barFor('strip-dev')?.getAttribute('x')).toBe('0');
    expect(barFor('strip-dev')?.getAttribute('width')).toBe('8');
    expect(barFor('strip-dev')?.getAttribute('data-finish')).toBe('6');
  });
});

describe('the words on the bars are HTML over the chart', () => {
  /** The overlay label drawn on one slice's bar, or null where none is. */
  const labelOn = (sliceId: string): HTMLElement | null =>
    document.querySelector(`[data-gantt-bar-label="${sliceId}"]`);

  const oneAssignedBar = (parts: { start: number; finish: number; duration: number }): GanttPlan =>
    planOf({
      rows: [rowAt('trim', 0, 1), rowAt('strip', parts.start, parts.finish)],
      slices: [
        sliceAt('trim-dev', 'trim', 0, 1, { personId: 'ravi' }),
        sliceAt('strip-dev', 'strip', parts.start, parts.finish, {
          personId: 'kat',
          duration: parts.duration,
        }),
      ],
      personNames: new Map([
        ['ravi', 'Ravi'],
        ['kat', 'Kat'],
      ]),
    });

  itDom('puts the person’s name where the bar is, in pixels the chart’s own math gives', () => {
    render(
      <GanttPanel
        plan={oneAssignedBar({ start: 5, finish: 9, duration: 4 })}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    const label = labelOn('strip-dev');
    // Expected from the same two constants the SVG is sized by, never a pixel
    // number written out: a test holding `196px` would go on passing with the
    // day narrowed to 24. Seven and not five, because the span the label sits
    // over is the calendar's — the same conversion the rect under it made.
    //
    // Proof: `left: x * DAY_PX` replaced by `left: bar.rowIndex * DAY_PX` — a
    // label on the right row, one row's width from the left edge. This test
    // alone failed, on `expected '40px' to be '208px'`. Re-watched 2026-08-09.
    //
    // The band is in the number because the SVG under this span begins one band
    // left of day 0 (see {@link CHART_PAD_PX}); dropping it here puts every
    // name 12px left of the bar it belongs to.
    expect(label?.textContent).toBe('Kat · strip - strip');
    expect(label?.style.left).toBe(`${String(7 * DAY_PX + CHART_PAD_PX)}px`);
    expect(label?.style.width).toBe(`${String(4 * DAY_PX)}px`);
    // Second row, and the same inset the rect above it has: the words sit on
    // the bar rather than beside it.
    expect(label?.style.top).toBe(`${String(1 * ROW_PX + 0.18 * ROW_PX)}px`);
    // And those pixels are measured from the SVG's own box. `absolute` is
    // resolved against the nearest positioned ancestor, so a label whose
    // wrapper is not `relative` lands somewhere up the page — every number
    // above still correct and the label nowhere near its bar. jsdom lays
    // nothing out and cannot see that; it can see the arrangement that decides
    // it.
    //
    // Proof: `relative` dropped from the wrapper's class. This test alone
    // failed, on `expected false to be true`. Watched, 2026-08-09.
    const box = label?.parentElement;
    expect(box?.classList.contains('relative')).toBe(true);
    expect(box?.querySelector('[data-gantt-chart]')).not.toBeNull();
  });

  itDom('writes nothing at all on a bar too narrow to hold a letter', () => {
    render(
      <GanttPanel
        plan={oneAssignedBar({ start: 3, finish: 3.2, duration: 0.2 })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // 0.2 of a workday is 5.6px, and the padding alone is 6 of them.
    //
    // Proof: the `if (shown === null) return null` guard in the overlay
    // replaced by rendering the span regardless. This test failed on `expected
    // <span …> to be null` — an empty label box sitting over a 5px bar, which
    // is a click target and a stray outline in a browser. Watched, 2026-08-09.
    expect(labelOn('strip-dev')).toBeNull();
    // The wide bar on the row above still has its words, so this is a threshold
    // and not a switch that turned every label off.
    expect(labelOn('trim-dev')?.textContent).toBe('Ravi · trim - trim');
  });

  itDom('writes the row’s own words after the assignee, and alone when nobody fits', () => {
    // The composition, taken directly: the assignee part the width already
    // decided, then ` · `, then the row words — which are never dropped for
    // room, because the label box crops them with an ellipsis instead.
    expect(barText('Kat', '010 - Strip', 4)).toBe('Kat · 010 - Strip');
    expect(barText(null, '010 - Strip', 4)).toBe('010 - Strip');
    // The one refusal: a bar without room for a single character.
    expect(barText(null, '010 - Strip', 0.2)).toBeNull();
    expect(barText('Kat', '010 - Strip', 0.2)).toBeNull();
  });

  itDom('carries the row words whole even where the box must crop them', () => {
    // One workday is 28px — room for four characters, nowhere near the words.
    // The DOM still holds the full string and the box crops it: a label
    // shortened by dropping the words would read as the assignee-only chart
    // this change removes.
    //
    // Proof: `barText` given the old appending rule — the words only when they
    // fully fit — `4 failed | 48 passed`: this test on `expected 'Kat' to be
    // 'Kat · strip - strip'`, and the three narrow-bar cases beside it, while
    // every wide bar stayed green. Watched 2026-08-09.
    render(
      <GanttPanel
        plan={oneAssignedBar({ start: 5, finish: 6, duration: 1 })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );
    const label = labelOn('strip-dev');
    expect(label?.textContent).toBe('Kat · strip - strip');
    // Cropped by the box, in a size that sits inside the bar: the ellipsis
    // classes and the smaller font are what make the full string honest.
    expect(label?.classList.contains('text-ellipsis')).toBe(true);
    expect(label?.classList.contains('overflow-hidden')).toBe(true);
    expect(label?.classList.contains('text-[9px]')).toBe(true);
  });

  itDom('writes the row words on a bar nobody is on', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 4)],
          slices: [sliceAt('strip-dev', 'strip', 0, 4)],
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );
    // An unassigned bar used to write nothing at all — sixty grey bars with no
    // words was the fault. Now the row words stand alone.
    expect(labelOn('strip-dev')?.textContent).toBe('strip - strip');
  });

  itDom('keeps the ? first on an unestimated bar, the row words after it', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('seal', 0, 0)],
          slices: [sliceAt('seal-dev', 'seal', 0, 0, { duration: 0, estimated: false })],
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );
    // The `?` is the width's own disclaimer and is never dropped; the row
    // words follow it rather than replace it.
    expect(labelOn('seal-dev')?.textContent).toBe('? · seal - seal');
  });

  itDom('writes the label in ink the bar it sits on can be read through', () => {
    // Nine people down the rows, so the ninth takes `#bcbd22` — the palette's
    // highlighter, the one entry white disappears into.
    const nine = Array.from({ length: 9 }, (_, at) => `person-${String(at)}`);
    render(
      <GanttPanel
        plan={planOf({
          rows: nine.map((_, at) => rowAt(`row-${String(at)}`, 0, 4)),
          slices: nine.map((personId, at) =>
            sliceAt(`slice-${String(at)}`, `row-${String(at)}`, 0, 4, { personId }),
          ),
          personNames: new Map(nine.map((personId) => [personId, `Person ${personId.slice(-1)}`])),
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // Proof: `color: inkOn(bar.personColor)` replaced by `color: '#ffffff'` —
    // the one white this whole function exists to avoid. This test alone
    // failed, on `expected 'rgb(255, 255, 255)' to be 'rgb(15, 23, 42)'`.
    // Watched, 2026-08-09.
    expect(labelOn('slice-8')?.style.color).toBe('rgb(15, 23, 42)');
    expect(labelOn('slice-0')?.style.color).toBe('rgb(255, 255, 255)');
  });

  itDom('shortens a name to initials before it clips, and never mid-word', () => {
    // The three answers of one measurement, taken directly: 4 workdays is
    // 112px and holds `Kat Bloom`; 1 workday is 28 and holds `KB`; a fifth of
    // one holds nothing.
    expect(barLabelFor('Kat Bloom', 4)).toBe('Kat Bloom');
    expect(barLabelFor('Kat Bloom', 1)).toBe('KB');
    expect(barLabelFor('Kat Bloom', 0.2)).toBeNull();
    expect(barLabelFor(null, 4)).toBeNull();
  });

  itDom('keeps the ? on a ghost bar however little room the name leaves', () => {
    // The assumed span is 2 workdays — 56px, of which 50 are writable — and
    // `Kat · ?` is 7 characters at ~5.5px, so the name rides along. A longer
    // name gives up its letters first and then itself; the `?` never goes.
    expect(assumedLabelFor('Kat', ASSUMED_UNESTIMATED_WORKDAYS)).toBe('Kat · ?');
    expect(assumedLabelFor('Katherine Bloomfield', ASSUMED_UNESTIMATED_WORKDAYS)).toBe('KB · ?');
    expect(assumedLabelFor('Katherine Bloomfield', 0.5)).toBe('?');
    expect(assumedLabelFor(null, ASSUMED_UNESTIMATED_WORKDAYS)).toBe('?');
    // Narrower than one `?` and there is nothing honest to write.
    expect(assumedLabelFor('Kat', 0.2)).toBeNull();
  });

  itDom('takes initials from the first and last names, and never doubles one', () => {
    expect(initialsOf('Kat Bloom')).toBe('KB');
    expect(initialsOf('Kat van der Bloom')).toBe('KB');
    expect(initialsOf('Kat')).toBe('K');
    expect(initialsOf('  ')).toBe('');
  });

  itDom('leaves the label out of the way of the click that takes the plan to a row', () => {
    render(
      <GanttPanel
        plan={oneAssignedBar({ start: 3, finish: 7, duration: 4 })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // A span over the middle of every bar would swallow the click the panel's
    // one interaction is made of. jsdom does no hit testing, so this is the
    // class that stops it rather than a dispatched click — the browser gate is
    // what can see the click land.
    expect(labelOn('strip-dev')?.classList.contains('pointer-events-none')).toBe(true);
  });
});

describe('the axis is a calendar', () => {
  const eightWorkdays = (startDate: IsoDate | null) =>
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 8)],
          slices: [sliceAt('strip-dev', 'strip', 0, 8)],
        })}
        startDate={startDate}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

  itDom('puts the weekend on the axis, greyed, with the heavy line on the Monday', () => {
    eightWorkdays(MONDAY_START);

    // Cells 5 and 6 are the Saturday and the Sunday of the plan's first week,
    // and cell 7 is the Monday after them — which is where the week boundary
    // is, seven cells along rather than five.
    //
    // Proof: the heavy line put back on `offset % WEEK_DAYS === 0` — five
    // cells, which on a calendar is a Saturday. This test alone failed, on
    // `expected 'stroke-border/40' to be 'stroke-border'` at cell 7, the Monday
    // that then had no line on it. Watched 2026-08-09.
    expect(markAttribute('[data-axis-day="5"]', 'data-axis-date')).toBe('2026-08-15');
    expect(markAttribute('[data-axis-day="6"]', 'data-axis-date')).toBe('2026-08-16');
    expect(markAttribute('[data-axis-day="5"]', 'data-axis-weekend')).toBe('true');
    expect(markAttribute('[data-axis-day="6"]', 'data-axis-weekend')).toBe('true');
    expect(markAttribute('[data-axis-day="7"]', 'data-axis-date')).toBe('2026-08-17');
    expect(document.querySelector('[data-axis-day="7"][data-axis-weekend]')).toBeNull();

    expect(markAttribute('[data-gantt-gridline="7"]', 'class')).toBe('stroke-border');
    expect(markAttribute('[data-gantt-gridline="5"]', 'class')).toBe('stroke-border/40');
    expect(markAttribute('[data-gantt-gridline="6"]', 'class')).toBe('stroke-border/40');

    // And the weekend is a column of the chart rather than a label on the axis
    // — the whole point of the change, drawn where a reader sees it.
    //
    // Proof: the weekend `<rect>` block deleted from the SVG. This test alone
    // failed, on `expected 'nothing on the chart at [data-gantt-w…' to be
    // '1'` — an axis that says Saturday over a chart with no Saturday on it.
    // Watched 2026-08-09.
    expect(markAttribute('[data-gantt-weekend="5"]', 'width')).toBe('1');
    expect(markAttribute('[data-gantt-weekend="6"]', 'width')).toBe('1');
    expect(document.querySelector('[data-gantt-weekend="7"]')).toBeNull();
  });

  itDom('prints the workday offsets and no weekend at all without a start date', () => {
    eightWorkdays(null);

    // The axis this change did not touch: eight workdays, eight cells, no
    // calendar anywhere, and the heavy line every fifth one.
    //
    // Proof: the scale built unconditionally — `placeOnCalendar(chart,
    // startDate)` with a null start date, so `addWorkdays` was handed one.
    // This test alone failed, with the render itself throwing `Error: not a
    // calendar date: null` out of `render` rather than quietly drawing an
    // offset chart. Watched 2026-08-09.
    expect(document.querySelectorAll('[data-axis-day]')).toHaveLength(8);
    expect(document.querySelectorAll('[data-axis-date]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-axis-weekend]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-gantt-weekend]')).toHaveLength(0);
    // And a slice at workday 5 is drawn at 5, not at the 7 a calendar would
    // give it.
    expect(barFor('strip-dev')?.getAttribute('x')).toBe('0');
    expect(barFor('strip-dev')?.getAttribute('width')).toBe('8');

    // Five workdays is a working week and this axis holds no weekends, so the
    // boundary is arithmetic rather than a calendar question.
    //
    // Proof: the condition changed to `offset % 7 === 0` — a calendar week's
    // worth of days on an axis that holds none. This test alone failed, on
    // `expected 'stroke-border/40' to be 'stroke-border'` at day 5. Watched,
    // 2026-08-09.
    expect(markAttribute('[data-gantt-gridline="0"]', 'class')).toBe('stroke-border');
    expect(markAttribute('[data-gantt-gridline="5"]', 'class')).toBe('stroke-border');
    expect(markAttribute('[data-gantt-gridline="4"]', 'class')).toBe('stroke-border/40');
    expect(markAttribute('[data-gantt-gridline="6"]', 'class')).toBe('stroke-border/40');
  });

  itDom('bands every other row so a wide chart can be read across', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 6), rowAt('sand', 0, 6), rowAt('trim', 0, 6)],
          slices: [
            sliceAt('strip-dev', 'strip', 0, 6),
            sliceAt('sand-dev', 'sand', 0, 6),
            sliceAt('trim-dev', 'trim', 0, 6),
          ],
        })}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // Every other one, starting from the second: three rows make one band.
    //
    // Proof: the band block's `filter((label) => label.rowIndex % 2 === 1)`
    // turned off (`filter(() => false)`). This test alone failed, on `expected
    // [] to deeply equal [ '1' ]`. Watched, 2026-08-09.
    expect(
      [...document.querySelectorAll('[data-gantt-band]')].map((band) =>
        band.getAttribute('data-gantt-band'),
      ),
    ).toEqual(['1']);
    expect(markAttribute('[data-gantt-band="1"]', 'height')).toBe('1');
    // And a band reaches the whole calendar width rather than the six workdays
    // the engine counted, so the row it marks is readable to the last cell.
    expect(markAttribute('[data-gantt-band="1"]', 'width')).toBe('8');
  });
});

/** The Monday the fixture plan begins on, so every offset below is a weekday. */
const MONDAY = '2026-08-10';

const DEV: RoleView = { id: 'role-dev', name: 'Dev' };

const NO_DAYS: Days = { optimistic: 0, realistic: 0, pessimistic: 0 };

/**
 * One row of the fixture plan, with the schedule be-01 would have placed it at
 * and the dates be-01 would have printed from that schedule.
 *
 * The dates are written out rather than computed here on purpose: they are the
 * fixture's claim about what be-01 says, and the panel's own axis is what gets
 * compared to them. Two computations of the same rule would agree by
 * construction and prove nothing.
 */
function rowOf(parts: {
  id: string;
  number: string;
  name: string;
  parentId: string | null;
  start: number;
  finish: number;
  startsOn: string;
  endsOn: string;
  rolledUp?: boolean;
  /** A manual "no earlier than" date, as a calendar date the way be-01 stores it. */
  notBefore?: string;
}): WorkItemView {
  return {
    id: parts.id,
    parentId: parts.parentId,
    revision: 0,
    number: parts.number,
    name: parts.name,
    notes: '',
    frozenNumber: null,
    rolledUp: parts.rolledUp ?? false,
    estimates: parts.rolledUp === true ? {} : { [DEV.id]: NO_DAYS },
    dependsOn: [],
    finalDays: { [DEV.id]: parts.finish - parts.start },
    finalTotal: parts.finish - parts.start,
    dates: { startsOn: parts.startsOn, endsOn: parts.endsOn },
    startNoEarlierThan: parts.notBefore ?? null,
    serviceTeamId: null,
    assignees: {},
    doesEveryPhase: null,
    schedule: {
      duration: parts.finish - parts.start,
      estimated: true,
      earliestStart: parts.start,
      earliestFinish: parts.finish,
      latestStart: parts.start,
      latestFinish: parts.finish,
      float: 0,
      critical: false,
    },
  };
}

/**
 * A plan of four rows on a calendar: a branch of two, and one row beside it.
 *
 * `Hull` spans its two children (0→5) and is the only parent, so it draws a
 * summary bracket and its children draw bars. `Rigging` reaches to 6, which is
 * what gives the axis a sixth workday for the ceil−1 negative to land on
 * instead of running off the end of it.
 */
const PLAN: WorkItemView[] = [
  rowOf({
    id: 'hull',
    number: '010',
    name: 'Hull',
    parentId: null,
    start: 0,
    finish: 5,
    startsOn: '2026-08-10',
    endsOn: '2026-08-14',
    rolledUp: true,
  }),
  rowOf({
    id: 'sanding',
    number: '011',
    name: 'Sanding',
    parentId: 'hull',
    start: 0,
    finish: 3,
    startsOn: '2026-08-10',
    endsOn: '2026-08-12',
  }),
  rowOf({
    id: 'sealing',
    number: '012',
    name: 'Sealing',
    parentId: 'hull',
    start: 3,
    finish: 5,
    startsOn: '2026-08-13',
    endsOn: '2026-08-14',
  }),
  rowOf({
    id: 'rigging',
    number: '020',
    name: 'Rigging',
    parentId: null,
    start: 3,
    finish: 6,
    startsOn: '2026-08-13',
    endsOn: '2026-08-17',
    // Five workdays after the Monday the plan starts, and seven calendar days:
    // the one date in the fixture that tells the two apart.
    notBefore: '2026-08-17',
  }),
];

/** One slice per leaf, which is what a one-phase plan gets from the engine. */
const sliceOf = (workItemId: string, start: number, finish: number): SliceView => ({
  id: `${workItemId}::${DEV.id}`,
  workItemId,
  roleId: DEV.id,
  personId: null,
  duration: finish - start,
  estimated: true,
  earliestStart: start,
  earliestFinish: finish,
  latestStart: start,
  latestFinish: finish,
  float: 0,
  critical: false,
  boundBy: 'projectStart',
  resourcePredecessorId: null,
});

const SLICES: SliceView[] = [
  sliceOf('sanding', 0, 3),
  sliceOf('sealing', 3, 5),
  sliceOf('rigging', 3, 6),
];

/**
 * What this fake was asked for and does not do.
 *
 * A throw rather than a silent `undefined`, for `plan-cards.test.tsx`'s reason:
 * a test that reached one of these would be exercising a path nothing here
 * models.
 */
const notImplemented = (what: string): never => {
  throw new Error(`the Gantt tests' fake project API has no ${what}`);
};

/**
 * The four reads `refresh` makes, disagreeing — which is what a peer's edit
 * landing between two of them leaves behind.
 *
 * `tree` carries the slices **and** the roles and names they were placed with;
 * `roles` and `listPeople` are separate requests at separate moments. This is
 * how a test says "these two moments do not agree" without inventing a
 * `GanttPlan` by hand: a hand-built plan proves the geometry throws, and the
 * question here is which of the four reads the panel is drawn from.
 */
interface ReadSkew {
  /** The slices `tree` answers with, when the fixture's own will not do. */
  slices?: SliceView[];
  /** What the **separate** role read says, when it disagrees with the payload. */
  roles?: RoleView[];
  /** What the **separate** people read says, when it disagrees with the payload. */
  people?: PersonView[];
}

/**
 * A read-only `ProjectApi` over {@link PLAN}.
 *
 * Read-only because nothing about the chart is an edit: these tests collapse a
 * branch, type in the Find box and click a bar, and every one of those is
 * answered from the tree that arrived. `plan-cards.test.tsx`'s fake writes, and
 * borrowing it would mean importing a file whose own tests would run again.
 */
function fakeApi(startDate: string | null, skew: ReadSkew = {}): ProjectApi {
  const people: PersonView[] = [{ id: 'kat', name: 'Kat', teamIds: [] }];
  const teams: TeamView[] = [];
  return {
    tree: () =>
      Promise.resolve({
        workItems: PLAN.map((row) => ({ ...row, dates: startDate === null ? null : row.dates })),
        seq: 0,
        scheduleError: null,
        slices: skew.slices ?? SLICES,
        // The roles and the names the slices above were placed with — one
        // payload, which is the whole of the invariant the chart is drawn on.
        roles: [{ ...DEV }],
        assignedPeople: [{ id: 'kat', name: 'Kat' }],
        estimateMethod: 'pert' as const,
        startDate,
        projectRevision: 0,
        undoable: false,
        redoable: false,
      }),
    // The **separate** read, which the skewed fixture below makes disagree with
    // the payload above on purpose.
    roles: () => Promise.resolve(skew.roles ?? [{ ...DEV }]),
    listTeams: () => Promise.resolve(teams),
    listPeople: () => Promise.resolve(skew.people ?? people),
    listProjects: () => notImplemented('listProjects'),
    createProject: () => notImplemented('createProject'),
    openProject: () => notImplemented('openProject'),
    renameProject: () => notImplemented('renameProject'),
    undo: () => notImplemented('undo'),
    redo: () => notImplemented('redo'),
    setEstimateMethod: () => notImplemented('setEstimateMethod'),
    setStartDate: () => notImplemented('setStartDate'),
    addRole: () => notImplemented('addRole'),
    renameRole: () => notImplemented('renameRole'),
    removeRole: () => notImplemented('removeRole'),
    addTeam: () => notImplemented('addTeam'),
    addPerson: () => notImplemented('addPerson'),
    create: () => notImplemented('create'),
    patch: () => notImplemented('patch'),
    setEstimate: () => notImplemented('setEstimate'),
    assign: () => notImplemented('assign'),
    move: () => notImplemented('move'),
    duplicate: () => notImplemented('duplicate'),
    remove: () => notImplemented('remove'),
    clearEstimate: () => notImplemented('clearEstimate'),
    freeze: () => notImplemented('freeze'),
    unfreezeProject: () => notImplemented('unfreezeProject'),
    unfreeze: () => notImplemented('unfreeze'),
    addDependency: () => notImplemented('addDependency'),
    removeDependency: () => notImplemented('removeDependency'),
  };
}

/** Puts the plan on screen and opens the chart under it. */
async function showTheChart(startDate: string | null = MONDAY, skew: ReadSkew = {}): Promise<void> {
  render(<WbsTable projectId="p1" api={fakeApi(startDate, skew)} />);
  await screen.findByText('Hull');
  fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
  await screen.findByLabelText('Gantt chart');
}

/** Every row the chart has drawn a label for, in the order it drew them. */
const labelsOnTheChart = (): string[] =>
  [...document.querySelectorAll('[data-gantt-label]')].map((label) => label.textContent);

/**
 * The calendar date the axis puts on one **workday**, or null where it prints
 * none.
 *
 * By `data-axis-workday` and not `data-axis-day`: a cell's own attribute is
 * where it stands on the calendar, and the workday it is, is the second thing
 * it carries. A bar's `data-start` is a workday, so this is the lookup that
 * joins the two — and a weekend cell answers for nobody, which is the point.
 */
const axisDateOn = (workday: string): string | null =>
  document.querySelector(`[data-axis-workday="${workday}"]`)?.getAttribute('data-axis-date') ??
  null;

/** The bar drawn for one work item's only slice. */
function barOn(workItemId: string): Element {
  const bar = document.querySelector(`[data-gantt-bar="${workItemId}::${DEV.id}"]`);
  // A missing bar is a broken fixture rather than a state to assert around: the
  // test that follows would report a click that landed nowhere.
  if (bar === null) throw new Error(`no bar on the chart for ${workItemId}`);
  return bar;
}

/**
 * What one of the table's schedule columns prints for the row at `at`.
 *
 * A throw rather than an empty string for a row that is not there: an empty
 * string would compare equal to an axis that printed nothing, and the whole
 * point of this comparison is that both sides said something.
 */
function columnText(columnId: string, at: number): string {
  const cell = [...document.querySelectorAll(`td[data-column="${columnId}"]`)].at(at);
  if (cell === undefined) throw new Error(`the table has no ${columnId} cell at row ${String(at)}`);
  return cell.textContent;
}

/**
 * The whole day one schedule column is showing a short date for.
 *
 * The columns print `13 Aug` since `T2 compact-columns`; the day in full is in
 * the cell's `title`, which is the form the axis under the chart is labelled
 * in and so the form the two can be compared in.
 *
 * @throws when the cell carries no `title` at all — a column printing workday
 * offsets has none, and comparing an axis date against nothing would be a
 * check that could not fail.
 */
function columnDay(columnId: string, at: number): string {
  const cell = [...document.querySelectorAll(`td[data-column="${columnId}"]`)].at(at);
  if (cell === undefined) throw new Error(`the table has no ${columnId} cell at row ${String(at)}`);
  const day = cell.querySelector('[title]')?.getAttribute('title');
  if (day === undefined || day === null) {
    throw new Error(`the ${columnId} cell at row ${String(at)} is not showing a date at all`);
  }
  // The End column says two things in one attribute — the day, and what its
  // `?` marker means — and only the day is comparable with an axis label.
  return day.split(' — ')[0] ?? day;
}

describe('the chart mirrors the plan', () => {
  itDom('leaves a collapsed branch’s children off the chart', async () => {
    await showTheChart();
    expect(labelsOnTheChart()).toEqual([
      '010 - Hull',
      '011 - Sanding',
      '012 - Sealing',
      '020 - Rigging',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));

    // Proof: the panel fed `flat` — every row of the tree, which is what "the
    // full row list" means once the model's own expansion is out of the way.
    // Failed on `expected [ 'Hull', 'Sanding', 'Sealing', …(1) ] to deeply equal
    // [ 'Hull', 'Rigging' ]`: a chart drawing two rows the plan above it had
    // closed. Watched, 2026-08-09.
    //
    // `table.getRowModel().rows` is *not* the fault this one sees — that model
    // is already narrowed by the expansion, and this test passed under it while
    // the search test below failed. Both are here for that reason.
    expect(labelsOnTheChart()).toEqual(['010 - Hull', '020 - Rigging']);
  });

  itDom('draws exactly the rows a search narrowed the plan to', async () => {
    await showTheChart();

    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'S' } });

    // `Sanding` and `Sealing` match; `Hull` is kept because it places them.
    //
    // Proof: the panel fed `table.getRowModel().rows`, which no search narrows
    // — this failed on `expected [ 'Hull', 'Sanding', 'Sealing', …(1) ] to
    // deeply equal [ 'Hull', 'Sanding', 'Sealing' ]` while the collapse test
    // above went on passing. Watched, 2026-08-09.
    expect(labelsOnTheChart()).toEqual(['010 - Hull', '011 - Sanding', '012 - Sealing']);
  });

  itDom('takes the plan to a row when its bar is clicked', async () => {
    await showTheChart();

    fireEvent.click(barOn('sealing'));

    // Proof: `goToRow`'s lookup pointed at `not-before` — a column the table
    // has and the cards have not. **Three** tests failed on that one edit, in
    // two different ways, and the run said `3 failed | 10 passed`:
    //   this one and `takes the plan to a row when its label is clicked` on
    //     `expected <input type="date" …(6)></input> to be <textarea …(5)>
    //     </textarea>` — the caret in the wrong cell of the right row;
    //   `takes the plan to a row on the cards face too` on `expected <body
    //     style><div>…(1)</div></body> to be <textarea …(5)></textarea>` — the
    //     caret not moving at all, because `cellIn` found nothing to move it
    //     to.
    // The second message is the one only the cards face can produce, which is
    // why the click is proven on both faces rather than on the table alone.
    // Watched, 2026-08-09.
    expect(document.activeElement).toBe(screen.getByLabelText('Name of 012'));
  });

  itDom('takes the plan to a row when its label is clicked', async () => {
    await showTheChart();

    fireEvent.click(screen.getByRole('button', { name: '011 - Sanding' }));

    expect(document.activeElement).toBe(screen.getByLabelText('Name of 011'));
  });

  /**
   * The same click on the other renderer, and the reason it is a second test:
   * the cards draw three of the table's cells and none of its other columns
   * (`M mobile-cards`). A lookup that named one of the others lands the caret
   * in the wrong cell on the table and moves it nowhere at all here — two
   * failures the same edit produced, and only this test sees the second.
   * Watched, 2026-08-09; the messages are on the negative above.
   */
  itDom('takes the plan to a row on the cards face too', async () => {
    widthIs(PHONE);
    render(<WbsTable projectId="p1" api={fakeApi(MONDAY)} />);
    await screen.findByLabelText('Name of 010');
    fireEvent.click(screen.getByRole('button', { name: 'Plan actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Gantt' }));
    await screen.findByLabelText('Gantt chart');

    fireEvent.click(barOn('sealing'));

    expect(document.activeElement).toBe(screen.getByLabelText('Name of 012'));
  });
});

/**
 * The axis and the Start/End columns are two readings of one schedule, and this
 * is the test that says they cannot disagree — string for string, be-01's
 * printed dates against the panel's own.
 */
describe('the calendar axis agrees with the columns', () => {
  itDom('reads the same dates under a bar as the row’s Start and End cells', async () => {
    await showTheChart();

    // `Sealing`, the third row of the plan and the third of the chart: 3→5.
    const bar = barOn('sealing');

    // The axis cells the bar's own attributes point at, against the strings the
    // row's columns print — not two dates computed the same way twice.
    //
    // Proof: the ceil−1 nudge dropped, so a bar's last day is `ceil(finish)`.
    // This failed on `expected '2026-08-17' to be '2026-08-14'` — the axis
    // claiming a Monday for work the End column says finished on the Friday.
    // Watched, 2026-08-09.
    expect(axisDateOn(bar.getAttribute('data-start') ?? '')).toBe(columnDay('start', 2));
    expect(axisDateOn(bar.getAttribute('data-last-day') ?? '')).toBe(columnDay('finish', 2));
    // The same two days in the sentence the bar shows on hover, which is where
    // a reader meets the rule rather than in an attribute.
    expect(bar.querySelector('title')?.textContent).toContain('2026-08-13 → 2026-08-14');
    // And it names neither of the two days a coordinate would give it. This
    // bar runs 3 → 5 and its right edge stops at calendar day 5 — Saturday
    // 2026-08-15, which nobody worked — while `addWorkdays(start, 5)` is
    // Monday 2026-08-17, the day its successor begins.
    //
    // Proof, **two faults, two runs**, each failing this test alone on
    // `expected '012 - Sealing\nDev · Unassigned\n2026…' to contain
    // '2026-08-13 → 2026-08-14'` — vitest abbreviates the title, and the two
    // sentences it abbreviates are different. Watched 2026-08-09:
    //   `spanWords`' finish fed `addWorkdays(start, endOf(5))`, which names
    //     Monday 2026-08-17 — the day the successor begins;
    //   `spanWords`' finish fed `addCalendarDays(start, endOf(5))`, which names
    //     Saturday 2026-08-15 — the day the bar's right edge stands on and
    //     nobody worked.
    expect(bar.querySelector('title')?.textContent).not.toContain('2026-08-17');
    expect(bar.querySelector('title')?.textContent).not.toContain('2026-08-15');
    // And the fixture's own claim about what be-01 printed, so a panel and a
    // table that agreed on the wrong dates would still be caught.
    expect(columnDay('start', 2)).toBe('2026-08-13');
    expect(columnDay('finish', 2)).toBe('2026-08-14');
    // And what the column actually shows, which is the short form of that same
    // day: the axis is labelled in full and the cell is not.
    expect(columnText('start', 2)).toBe('13 Aug');
  });

  itDom('holds a not-before flag at the calendar day its workday is', async () => {
    await showTheChart();

    // `Rigging` is the fourth row of the chart, and its stored date is
    // 2026-08-17: five workdays after the Monday the plan starts, and seven
    // calendar days. The chart is a calendar, so the flag stands at 7 — and it
    // stands **under the axis cell for that very date**, which is the assertion
    // that says the two agree rather than two numbers written out twice.
    //
    // The title of this test was once the opposite of the contract. On the
    // workday axis the flag stood at 5 and `notBeforeOffsetOf` counting
    // calendar days was the fault it guarded against; that guard is now the
    // second assertion below, which reads the date back off the workday the
    // offset is.
    expect(markAttribute('[data-gantt-not-before="3"]', 'd')).toMatch(/^M 7 /);
    expect(markAttribute('[data-axis-day="7"]', 'data-axis-date')).toBe('2026-08-17');
    // And the caret says the day that was typed, which is the offset's date and
    // never its coordinate's: calendar day 7 is 2026-08-17 here only because
    // the offset is 5, and `addWorkdays(start, 7)` would be 2026-08-19.
    expect(document.querySelector('[data-gantt-not-before="3"] title')?.textContent).toBe(
      'No earlier than 2026-08-17',
    );
  });

  itDom('prints workday offsets, and no dates at all, on a plan with no start date', async () => {
    await showTheChart(null);

    expect(document.querySelectorAll('[data-axis-date]')).toHaveLength(0);
    expect([...document.querySelectorAll('[data-axis-day]')].map((day) => day.textContent)).toEqual(
      ['0', '1', '2', '3', '4', '5'],
    );
  });
});

/**
 * {@link SLICES}, with the one fact `layOutGantt` refuses missing: `Sanding`'s
 * slice names a resource predecessor no slice in the payload has.
 *
 * The commonest way to hold such a payload is not a bug in be-01 at all — it is
 * a peer's edit landing between two of this client's four reads, which is the
 * skew {@link ReadSkew} is about. It throws, by design (`gantt-geometry.ts`),
 * and this fixture is what carries that throw onto the production render path.
 */
const SLICES_MISSING_A_PREDECESSOR: SliceView[] = SLICES.map((slice) =>
  slice.workItemId === 'sanding'
    ? { ...slice, boundBy: 'person' as const, resourcePredecessorId: 'a-slice-nobody-sent' }
    : slice,
);

/** What the boundary put on screen instead of a chart, or null while it did not. */
const faultWords = (): string | null =>
  document.querySelector('[data-gantt-fault]')?.textContent ?? null;

describe('a chart that cannot be drawn', () => {
  itDom('says why, and leaves the plan alone', async () => {
    await showTheChart(MONDAY, { slices: SLICES_MISSING_A_PREDECESSOR });

    // 1. The chart is not there, and the reason on screen is the payload's own
    //    words — the slice, and what it promised. "Something went wrong" would
    //    throw away the only description anybody will ever have of a skew that
    //    is over by the time it is read.
    expect(document.querySelector('[data-gantt-chart]')).toBeNull();
    expect(faultWords()).toContain('The chart cannot be drawn');
    expect(faultWords()).toContain('a-slice-nobody-sent');
    expect(faultWords()).toContain('which is not a slice in this payload');

    // 2. And the editor is untouched, which is the whole reason the boundary
    //    wraps the panel alone: the plan is what the reader came for, the chart
    //    is the optional feature that may degrade (AGENTS.md, R5).
    //
    // Proof: `<GanttFaultBoundary>` struck from `wbs-table.tsx` and the panel
    // rendered bare. This test failed with the render itself throwing —
    // `GanttDataError: slice sanding::role-dev names resource predecessor
    // a-slice-nobody-sent, which is not a slice in this payload`, out of
    // `render` rather than as a failed expectation, taking the four rows and
    // every toolbar control with it. Watched 2026-08-09.
    expect(screen.getByLabelText('Name of 010')).toHaveValue('Hull');
    expect(screen.getAllByLabelText(/^Name of /)).toHaveLength(4);
  });

  itDom('draws the chart again when the next read is whole', async () => {
    // The skew is one object the fake reads on every call, so moving it here is
    // a peer's next edit arriving — which is what a transient skew is.
    const skew: ReadSkew = { slices: SLICES_MISSING_A_PREDECESSOR };
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    render(<WbsTable projectId="p1" api={fakeApi(MONDAY, skew)} subscribe={subscribe} />);
    await screen.findByText('Hull');
    fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
    await screen.findByLabelText('Gantt chart');
    expect(faultWords()).toContain('The chart cannot be drawn');

    skew.slices = SLICES;
    notify();

    // React never retries a boundary on its own: without the reset this stays
    // on the fallback for the life of the page, and the reader's only way back
    // to a chart is to reload.
    //
    // Proof: `getDerivedStateFromProps` deleted from `GanttFaultBoundary`. This
    // test alone failed — `1 failed | 34 skipped`, on `Error: no bar on the
    // chart for sanding` — with the fallback still up over a plan that had been
    // whole since the refetch. Watched 2026-08-09.
    await waitFor(() => {
      expect(barOn('sanding')).not.toBeNull();
    });
    expect(faultWords()).toBeNull();
  });
});

describe('the chart is drawn from one read', () => {
  itDom('draws under the roles the payload carried, not the pickers’ list', async () => {
    // A peer removed `Dev` and added `Ops` between this client's `tree` read and
    // its `roles` read: the separate read now lists a phase no slice is under,
    // and lists none of the phase every slice **is** under. That is the
    // four-request skew this fix exists for, and nothing about it is malformed —
    // both answers were true when they were given.
    await showTheChart(MONDAY, { roles: [{ id: 'role-ops', name: 'Ops' }] });

    // Proof: `ganttPlan`'s `roles` put back to the `roles` state — the separate
    // read. This test failed on `expected null not to be null`, with the
    // boundary reading `The chart cannot be drawn: slice sanding::role-dev is
    // under role role-dev, which this plan does not list.` Watched 2026-08-09.
    expect(document.querySelector('[data-gantt-chart]')).not.toBeNull();
    expect(faultWords()).toBeNull();
    expect(labelsOnTheChart()).toEqual([
      '010 - Hull',
      '011 - Sanding',
      '012 - Sealing',
      '020 - Rigging',
    ]);
    // The phase's name is read from the same list the bar was placed by, so a
    // chart drawn from the skewed read would either throw or say `Ops`.
    expect(barOn('sanding').querySelector('title')?.textContent).toContain('Dev');
  });

  itDom('names the people the payload carried, not the directory read', async () => {
    // The other half, and it has its own test because one edit cannot reach
    // both: `Kat` is on `Sanding` in the payload, and the directory read is a
    // moment before she was added to it.
    await showTheChart(MONDAY, {
      slices: SLICES.map((slice) =>
        slice.workItemId === 'sanding' ? { ...slice, personId: 'kat' } : slice,
      ),
      people: [],
    });

    // Proof: `ganttPlan`'s `personNames` put back to the `people` state. This
    // test alone failed, on `expected 'The chart cannot be drawn: slice sand…'
    // to be null` — the boundary reading `slice sanding::role-dev is assigned
    // to kat, whom this plan does not name`. Watched 2026-08-09.
    expect(faultWords()).toBeNull();
    expect(barOn('sanding').querySelector('title')?.textContent).toContain('Kat');
    // And she is painted as somebody rather than as nobody, which is the other
    // thing the name decides.
    expect(barOn('sanding').getAttribute('fill')).toBe(PERSON_BAR_COLORS[0]);
  });
});

/**
 * The caption over the row labels names the month the reader is looking at,
 * which is only the starting month until the chart is scrolled. jsdom does no
 * layout, but a scroll event's `scrollLeft` is plain state — the arithmetic
 * from it to a workday index is what these hold.
 */
describe('the caption follows the scroll', () => {
  const augustIntoSeptember = () =>
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 10)],
          slices: [sliceAt('strip-dev', 'strip', 0, 10)],
        })}
        startDate="2026-08-24"
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

  itDom('opens naming the month it starts in, the way a person says it', () => {
    augustIntoSeptember();
    // `Aug 2026` and never `2026-08`: the corner is the one place the chart
    // names a month, and it names it as a month.
    //
    // Proof: `monthWords` short-circuited to `date.slice(0, 7)` — the old
    // caption. `3 failed | 49 passed`: this test and the scroll test on
    // `Unable to find an element with the text: Aug 2026` / `Sep 2026`, and
    // the fixed-table case with them. Watched 2026-08-09.
    expect(screen.getByText('Aug 2026')).toBeDefined();
  });

  itDom('names the month that is on screen, not the one it started in', () => {
    augustIntoSeptember();
    const panel = document.querySelector('[data-gantt-panel]');
    if (!(panel instanceof HTMLElement)) throw new Error('the panel is not on the page');
    // The axis is a calendar now, so the cell that names September is the
    // eighth: 2026-08-24 plus eight calendar days is 2026-09-01, where plus
    // eight **workdays** would be 2026-09-03. Its cell begins at 8 × DAY_PX
    // past the pad, so anything past that names September.
    //
    // Proof: the caption pinned back to `axis[0]` — this test failed on
    // `Unable to find an element with the text: 2026-09` while the opening
    // test above stayed green. Watched, 2026-08-09.
    panel.scrollLeft = 8 * DAY_PX + CHART_PAD_PX;
    fireEvent.scroll(panel);
    expect(screen.getByText('Sep 2026')).toBeDefined();
    expect(screen.queryByText('Aug 2026')).toBeNull();
  });

  itDom('says a month the way a person does, from a fixed table', () => {
    expect(monthWords('2026-08-17')).toBe('Aug 2026');
    expect(monthWords('2026-12-01')).toBe('Dec 2026');
    expect(monthWords('2027-01-31')).toBe('Jan 2027');
  });

  itDom('refuses a month no calendar has, out loud', () => {
    // The production caller only ever hands this validated dates, so the unit
    // boundary is where the guard can be seen at all. Without it the table
    // indexes past its end and the caption reads `undefined 2026` — a corner
    // quietly printing nonsense instead of a fault reaching the boundary.
    //
    // Proof: the range guard deleted, so the lookup ran unchecked. This test
    // alone failed, on `expected [Function] to throw an error` — the fault
    // came back as the string 'undefined 2026'. Watched 2026-08-09.
    expect(() => monthWords('2026-13-01')).toThrow('names a month no calendar has');
    expect(() => monthWords('not a date')).toThrow('names a month no calendar has');
  });
});

describe('the arrows switch', () => {
  const drawEveryMark = () =>
    render(
      <GanttPanel
        plan={everyMarkOnOneDay()}
        startDate={MONDAY_START}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

  const countOf = (selector: string): number => document.querySelectorAll(selector).length;

  itDom('hides every arrow and its head, and touches nothing else', () => {
    drawEveryMark();
    const toggle = document.querySelector('[data-gantt-arrows-toggle]');
    if (!(toggle instanceof HTMLElement)) throw new Error('the arrows switch is not on the panel');

    // Shown by default, and the switch says so.
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(countOf('[data-gantt-arrow]')).toBe(1);
    expect(countOf('[data-gantt-arrow-head]')).toBe(1);

    fireEvent.click(toggle);

    // Both marks of the stored dependency are gone — the elbow and the head
    // are two paths, and a filter keyed on one of them leaves the other as a
    // floating triangle pointing at nothing.
    //
    // Proof: the `arrowsShown &&` moved onto the elbow alone, heads left
    // drawn. This test alone failed, on `expected 1 to be +0` for the head
    // count. Watched 2026-08-09.
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(countOf('[data-gantt-arrow]')).toBe(0);
    expect(countOf('[data-gantt-arrow-head]')).toBe(0);
    // The person link, the caret and every bar are untouched: the switch
    // removes the stored-dependency marks alone.
    expect(countOf('[data-gantt-person-link]')).toBe(1);
    expect(countOf('[data-gantt-not-before]')).toBe(1);
    expect(countOf('[data-gantt-bar]')).toBe(3);

    fireEvent.click(toggle);
    expect(countOf('[data-gantt-arrow]')).toBe(1);
    expect(countOf('[data-gantt-arrow-head]')).toBe(1);
  });
});
