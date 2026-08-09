import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { GanttPanel } from './gantt-panel';
import { WbsTable } from './wbs-table';

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
 * The reviewed coordinate contract, asserted where it can be (codex #15).
 *
 * Strict string equality against numbers written by hand into the fixture, not
 * `toBeCloseTo` and not a comparison against something recomputed here: the
 * whole point of a user space measured in workdays is that the engine's number
 * reaches the attribute untouched. A pixel would have to round.
 */
describe('the chart is drawn in workdays', () => {
  itDom('puts a 3.5→6 slice at x=3.5 with a width of 2.5, and says so twice', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 3.5, 6)],
          slices: [sliceAt('strip-dev', 'strip', 3.5, 6, { duration: 2.5 })],
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    const bar = barFor('strip-dev');
    // Proof: `x` computed as `bar.start * DAY_PX` and `width` as
    // `bar.duration * DAY_PX` — the pixel arithmetic design §1 rejects. This
    // test alone failed, on `expected '98' to be '3.5'`, and `data-start` went
    // on saying 3.5 beside it — exactly the drift the two-place contract exists
    // to catch. Watched, 2026-08-09.
    expect(bar?.getAttribute('x')).toBe('3.5');
    expect(bar?.getAttribute('width')).toBe('2.5');
    expect(bar?.getAttribute('data-start')).toBe('3.5');
    expect(bar?.getAttribute('data-finish')).toBe('6');
  });

  itDom('gives the SVG a user space of the horizon by the rows', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 6)],
          slices: [sliceAt('strip-dev', 'strip', 0, 3), sliceAt('sand-dev', 'sand', 3, 6)],
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    const svg = document.querySelector('[data-gantt-chart]');
    // The horizon verbatim, and two rows of it. Same proof as above: with `x`
    // in pixels the viewBox stays 6 and the bars leave it, which is why this
    // assertion is not the one that catches the fault — the two together are.
    expect(svg?.getAttribute('viewBox')).toBe('0 0 6 2');
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('none');
  });

  itDom('tints the critical bar and leaves the other one alone', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 3), rowAt('sand', 0, 2)],
          slices: [
            sliceAt('strip-dev', 'strip', 0, 3, { critical: true }),
            sliceAt('sand-dev', 'sand', 0, 2),
          ],
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // The tint by name, not a `data-` attribute standing in for it: there is no
    // text on a bar, so the colour *is* the statement, and an attribute could
    // be right while the bar drew in the ordinary fill.
    expect(barFor('strip-dev')?.classList.contains('fill-destructive')).toBe(true);
    expect(barFor('sand-dev')?.classList.contains('fill-destructive')).toBe(false);
    expect(barFor('sand-dev')?.classList.contains('fill-primary')).toBe(true);
  });

  itDom('draws an unestimated slice hollow rather than as a slice of no days', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 0, 0)],
          slices: [sliceAt('strip-dev', 'strip', 0, 0, { estimated: false })],
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    expect(barFor('strip-dev')?.classList.contains('fill-none')).toBe(true);
    expect(barFor('strip-dev')?.classList.contains('fill-primary')).toBe(false);
  });

  itDom('names what holds a bar where it is, in a title nothing scales', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [rowAt('strip', 2, 5)],
          slices: [sliceAt('strip-dev', 'strip', 2, 5, { boundBy: 'predecessor' })],
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    expect(barFor('strip-dev')?.querySelector('title')?.textContent).toBe(
      'Waits for a dependency to finish',
    );
  });

  itDom('draws every other mark the geometry placed, in the same workdays', () => {
    render(
      <GanttPanel
        plan={planOf({
          rows: [
            rowAt('hull', 0, 5, { leaf: false }),
            rowAt('strip', 0, 3, { depth: 1 }),
            rowAt('sand', 3, 5, { depth: 1, notBeforeOffset: 4 }),
          ],
          slices: [
            sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat' }),
            sliceAt('sand-dev', 'sand', 3, 5, {
              personId: 'kat',
              boundBy: 'person',
              resourcePredecessorId: 'strip-dev',
            }),
          ],
          dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
          personNames: new Map([['kat', 'Kat']]),
        })}
        startDate={null}
        scheduleError={null}
        onPickRow={() => undefined}
      />,
    );

    // Four marks no assertion about a bar can see, each of them a `map` in the
    // SVG that could be deleted whole without a bar moving.
    //
    // Proof: the four blocks deleted one at a time, a run apiece. Each deletion
    // failed this test and only this test, on `1 failed | 13 passed`, and the
    // sentence stood in for the missing mark every time (vitest abbreviates the
    // selector in its summary line):
    //   bracket — `expected 'nothing on the chart at [data-gantt-b…' to contain 'L 5 0.5'`
    //   arrow   — `expected 'nothing on the chart at [data-gantt-a…' to contain 'M 3 1.5'`
    //   link    — `expected 'nothing on the chart at [data-gantt-p…' to contain '[stroke-dasharray:4_3]'`
    //   flag    — `expected 'nothing on the chart at [data-gantt-n…' to match /^M 4 /`
    // Watched, 2026-08-09.
    expect(markAttribute('[data-gantt-bracket="hull"]', 'd')).toContain('L 5 0.5');
    expect(markAttribute('[data-gantt-arrow="strip->sand"]', 'd')).toContain('M 3 1.5');
    // Dashed and its own colour: a hand-off is not a dependency, and the two
    // are told apart by nothing but how they are drawn.
    expect(markAttribute('[data-gantt-person-link="strip-dev->sand-dev"]', 'class')).toContain(
      '[stroke-dasharray:4_3]',
    );
    // The spec's own number: a flag at workday 4 begins at x = 4, in workdays
    // like everything else in here.
    //
    // Proof: the flag's `d` built from `flag.rowIndex` instead of
    // `flag.offset` — the mark still drawn, on the right row, at the wrong day.
    // Failed on `expected 'M 2 2.18 L 2.35 2.18 L 2 2.5 Z' to match /^M 4 /`.
    // Watched, 2026-08-09.
    expect(markAttribute('[data-gantt-not-before="2"]', 'd')).toMatch(/^M 4 /);
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
 * A read-only `ProjectApi` over {@link PLAN}.
 *
 * Read-only because nothing about the chart is an edit: these tests collapse a
 * branch, type in the Find box and click a bar, and every one of those is
 * answered from the tree that arrived. `plan-cards.test.tsx`'s fake writes, and
 * borrowing it would mean importing a file whose own tests would run again.
 */
function fakeApi(startDate: string | null): ProjectApi {
  const people: PersonView[] = [{ id: 'kat', name: 'Kat', teamIds: [] }];
  const teams: TeamView[] = [];
  return {
    tree: () =>
      Promise.resolve({
        workItems: PLAN.map((row) => ({ ...row, dates: startDate === null ? null : row.dates })),
        seq: 0,
        scheduleError: null,
        slices: SLICES,
        estimateMethod: 'pert' as const,
        startDate,
        projectRevision: 0,
        undoable: false,
        redoable: false,
      }),
    roles: () => Promise.resolve([{ ...DEV }]),
    listTeams: () => Promise.resolve(teams),
    listPeople: () => Promise.resolve(people),
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
async function showTheChart(startDate: string | null = MONDAY): Promise<void> {
  render(<WbsTable projectId="p1" api={fakeApi(startDate)} />);
  await screen.findByText('Hull');
  fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
  await screen.findByLabelText('Gantt chart');
}

/** Every row the chart has drawn a label for, in the order it drew them. */
const labelsOnTheChart = (): string[] =>
  [...document.querySelectorAll('[data-gantt-label]')].map((label) => label.textContent);

/** The calendar date the axis puts on one workday, or null where it prints none. */
const axisDateOn = (workday: string): string | null =>
  document.querySelector(`[data-axis-day="${workday}"]`)?.getAttribute('data-axis-date') ?? null;

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

describe('the chart mirrors the plan', () => {
  itDom('leaves a collapsed branch’s children off the chart', async () => {
    await showTheChart();
    expect(labelsOnTheChart()).toEqual(['Hull', 'Sanding', 'Sealing', 'Rigging']);

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
    expect(labelsOnTheChart()).toEqual(['Hull', 'Rigging']);
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
    expect(labelsOnTheChart()).toEqual(['Hull', 'Sanding', 'Sealing']);
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

    fireEvent.click(screen.getByRole('button', { name: 'Sanding' }));

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
describe('the workday axis agrees with the columns', () => {
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
    expect(axisDateOn(bar.getAttribute('data-start') ?? '')).toBe(columnText('start', 2));
    expect(axisDateOn(bar.getAttribute('data-last-day') ?? '')).toBe(columnText('finish', 2));
    // The same two days in the sentence the bar shows on hover, which is where
    // a reader meets the rule rather than in an attribute.
    expect(bar.querySelector('title')?.textContent).toContain('2026-08-13 → 2026-08-14');
    // And the fixture's own claim about what be-01 printed, so a panel and a
    // table that agreed on the wrong dates would still be caught.
    expect(columnText('start', 2)).toBe('2026-08-13');
    expect(columnText('finish', 2)).toBe('2026-08-14');
  });

  itDom('holds a not-before flag at the workday its date is, not its calendar day', async () => {
    await showTheChart();

    // `Rigging` is the fourth row of the chart, and its stored date is
    // 2026-08-17: five workdays after the Monday the plan starts, and seven
    // calendar days. The flag is what the chart says about that date, and the
    // two numbers are far enough apart that only one of them can be right.
    //
    // Proof: `notBeforeOffsetOf` counting calendar days —
    // `(Date.parse(notBefore) - Date.parse(startDate)) / 86_400_000` — instead
    // of calling `workdaysBetween`. Failed on `expected 'M 7 3.18 L 7.35 3.18
    // L 7 3.5 Z' to match /^M 5 /`: a flag two days past the Friday the row
    // actually cannot start before, on an axis stretched to hold it. Watched,
    // 2026-08-09.
    expect(markAttribute('[data-gantt-not-before="3"]', 'd')).toMatch(/^M 5 /);
  });

  itDom('prints workday offsets, and no dates at all, on a plan with no start date', async () => {
    await showTheChart(null);

    expect(document.querySelectorAll('[data-axis-date]')).toHaveLength(0);
    expect([...document.querySelectorAll('[data-axis-day]')].map((day) => day.textContent)).toEqual(
      ['0', '1', '2', '3', '4', '5'],
    );
  });
});
