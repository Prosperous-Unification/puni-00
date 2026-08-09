import { addWorkdays, type IsoDate } from '@wbs/domain/workday';

import { type GanttPlan, type GanttRowLabel, layOutGantt } from './gantt-geometry';
import { indentFor } from './table-frame';

/**
 * How wide one workday is on screen, in CSS pixels.
 *
 * The one number that turns the chart's user space into pixels, and it is used
 * in exactly two places: the SVG's CSS width (`horizon × DAY_PX`) and the width
 * of one cell of the HTML axis above it. Nothing inside the SVG multiplies by
 * it — that is the whole of the coordinate contract (design §1), and a bar
 * whose `x` were computed here would be pixels asserted against pixels.
 *
 * 28 is the narrowest a two-digit day-of-month reads at, measured against
 * nothing but the eye; the browser gate is what judges it after scaling.
 */
export const DAY_PX = 28;

/**
 * How tall one row of the chart is, in CSS pixels.
 *
 * The SVG's y unit is one row, so this is both the height of a label in the
 * sticky-left column and the scale factor of the y axis — the two cannot
 * disagree, which is what keeps a bar level with the name beside it.
 */
export const ROW_PX = 28;

/** How wide the sticky-left column of row labels is, in CSS pixels. */
const LABEL_COLUMN_PX = 176;

/**
 * How much of a row's height a bar leaves empty above and below it, in rows.
 *
 * A fraction of a row rather than a pixel padding: the SVG's y unit is a row,
 * so this is the only unit available inside it — and it stays correct at any
 * {@link ROW_PX}.
 */
const BAR_INSET = 0.18;
const BAR_HEIGHT = 1 - 2 * BAR_INSET;

/** Half a row down, which is where a line between two rows leaves and arrives. */
const ROW_MIDDLE = 0.5;

/** How wide a not-before flag is, in workdays — the unit the chart is drawn in. */
const FLAG_WIDTH = 0.35;

/**
 * The classes a bar carries, and the two facts they say.
 *
 * The tint **is** the critical path here — there is no text on a bar — so it is
 * asserted by name in `gantt-panel.test.tsx` rather than through a `data-`
 * attribute that could be right while the bar drew in the ordinary colour.
 * `data-critical` rides along for the browser gate, which needs to find the bar
 * before it can measure it.
 */
function barClasses(critical: boolean, estimated: boolean): string {
  if (!estimated) {
    // Hollow and dashed: nobody has estimated this slice, which is a different
    // fact from a slice of zero days and must not draw like one.
    return `fill-none ${critical ? 'stroke-destructive' : 'stroke-primary'} [stroke-dasharray:3_2]`;
  }
  return critical ? 'fill-destructive' : 'fill-primary';
}

/**
 * What one workday of the axis prints, and the date it stands for.
 *
 * Two answers rather than one, because the plan may not be on a calendar at
 * all: `date` is null then, and the axis prints the workday offset — the same
 * fallback the Start and End columns make (`spanOf` in `wbs-table.tsx`), so the
 * two cannot say different things about the same plan.
 */
interface AxisDay {
  workday: number;
  date: IsoDate | null;
  shown: string;
}

/**
 * The workday axis: one entry per whole workday the horizon reaches.
 *
 * The axis holds **no weekends** — it is workdays end to end — which is what
 * makes a weekend's compression exact rather than drawn out and then hidden.
 *
 * The label for workday `d` is `addWorkdays(startDate, d)`, which is the
 * function be-01 prints the Start column with. Not a copy of that rule: the
 * same module, imported directly rather than through `libs/domain`'s index,
 * which re-exports arktype-touching validators this bundle excludes
 * (`wbs-api.ts:1-9`).
 *
 * @throws Whatever `addWorkdays` throws when `startDate` is not a calendar
 * date. be-01 validated it at its boundary; a string that reaches here and is
 * not one is malformed trusted data, and the panel lets it reach the error
 * boundary rather than drawing an axis of `Invalid Date`.
 */
function workdayAxis(startDate: IsoDate | null, horizon: number): AxisDay[] {
  return Array.from({ length: Math.ceil(horizon) }, (_, workday) => {
    if (startDate === null) return { workday, date: null, shown: String(workday) };
    const date = addWorkdays(startDate, workday);
    // The day of the month alone: 28px is not a date. The whole date is on the
    // cell — in `data-axis-date` and in the `title` — and the corner above the
    // labels says which month these numbers are days of.
    return { workday, date, shown: date.slice(8) };
  });
}

/**
 * The last workday a span is still on: the same `ceil − 1` nudge be-01's
 * `datesOf` makes, for the same reason.
 *
 * A task of any length occupies the day it finishes on, so a two-day task
 * starting on workday 3 is still on workday 4 and not on workday 5.
 *
 * Proof: the `- 1` dropped, so a bar's last day is `ceil(finish)`. `reads the
 * same dates under a bar as the row's Start and End cells` in
 * `gantt-panel.test.tsx` failed on `expected '2026-08-17' to be '2026-08-14'`
 * and nothing else in the file did — one workday late is three calendar days
 * late over a weekend, the chart naming the Monday for work the End column
 * says finished on the Friday. Watched, 2026-08-09.
 */
export const lastWorkdayOf = (start: number, finish: number): number =>
  Math.max(start, Math.ceil(finish) - 1);

/**
 * The days a bar runs over, for the sentence it shows on hover — empty while
 * the plan is not on a calendar, because there are no days to name then.
 *
 * The same two dates the row's Start and End columns print, computed the same
 * way rather than read off the row: this is the panel's own reading of the
 * engine's numbers, and a test comparing the two is what says they agree.
 */
function spanWords(startDate: IsoDate | null, start: number, finish: number): string {
  if (startDate === null) return '';
  const from = addWorkdays(startDate, start);
  const to = addWorkdays(startDate, lastWorkdayOf(start, finish));
  return ` · ${from} → ${to}`;
}

/**
 * The Gantt panel: the placed schedule drawn, in the units it was placed in.
 *
 * **One SVG whose user space is the schedule.** `viewBox="0 0 horizon
 * rowCount"` with `preserveAspectRatio="none"`, so x is one workday and y is
 * one row and a bar is `<rect x={bar.start} width={bar.duration}>` — the
 * engine's numbers, unconverted, and carried again verbatim in
 * `data-start`/`data-finish`. Nothing in here multiplies by {@link DAY_PX}.
 *
 * The cost of that non-uniform scale is that glyphs and stroke widths would be
 * stretched with it, so **the SVG holds geometry and nothing else**: every word
 * is HTML around it — the row labels in the sticky-left column, the calendar in
 * the axis row — and every stroke carries `vector-effect="non-scaling-stroke"`.
 * The one exception is a `<title>` child on each bar, which no scale touches:
 * it is the sentence naming what holds that slice where it is.
 *
 * A cycle draws no bars at all. be-01 sends an empty slice array with it and
 * the row projections are meaningless, so the honest answer is the sentence
 * rather than a chart of zeroes — the same thing the banner above the plan
 * says, in the place somebody looking at the schedule is looking.
 *
 * @throws GanttDataError out of {@link layOutGantt} when the payload's slices
 * name something the payload has not got. See there.
 */
export function GanttPanel({
  plan,
  startDate,
  scheduleError,
  onPickRow,
}: {
  plan: GanttPlan;
  /** The day the plan begins, or null while it is not on a calendar. */
  startDate: IsoDate | null;
  /** be-01's answer when no dates could be worked out at all. */
  scheduleError: 'cycle' | null;
  /** Takes the plan to a row — the caller decides what "takes" means. */
  onPickRow: (rowId: string) => void;
}) {
  if (scheduleError === 'cycle') {
    return (
      <section data-gantt-panel aria-label="Gantt chart" className="border-border border-t p-3">
        <p role="status" className="text-sm">
          Nothing can be drawn while these dependencies run in a circle — no dates could be worked
          out. Remove one and the chart comes back.
        </p>
      </section>
    );
  }

  const chart = layOutGantt(plan);
  // At least one row of user space, so an empty plan still has a viewBox with a
  // height rather than one the browser divides by.
  const rowCount = Math.max(1, chart.labels.length);
  const axis = workdayAxis(startDate, chart.horizon);
  const chartWidth = axis.length * DAY_PX;
  const rowIdAt = (rowIndex: number): string | undefined => chart.labels[rowIndex]?.id;

  return (
    <section
      data-gantt-panel
      aria-label="Gantt chart"
      // Its own scroll area, in both directions: the plan above keeps its frame
      // and this takes a bounded share of what is left, so neither the page nor
      // the section it sits in ever scrolls sideways. `shrink-0` with a max
      // height rather than a flex basis — the table stays the editor and the
      // chart takes what it needs up to the cap.
      className="border-border max-h-[40vh] shrink-0 overflow-auto border-t"
    >
      <div className="flex w-max">
        {/*
          Holds the left edge while the chart scrolls under it. `sticky left-0`
          inside this scroll container, with a background of its own — a
          transparent one would have the bars painted through the names.
        */}
        <div
          data-gantt-labels
          className="bg-background sticky left-0 z-10 shrink-0"
          style={{ width: LABEL_COLUMN_PX }}
        >
          <div
            className="text-muted-foreground border-border flex items-center border-b px-2 text-[10px]"
            style={{ height: ROW_PX }}
          >
            {startDate === null ? 'Workday' : (axis[0]?.date?.slice(0, 7) ?? 'Workday')}
          </div>
          {chart.labels.map((label: GanttRowLabel) => (
            <button
              key={label.id}
              type="button"
              data-gantt-label={label.id}
              title={label.name}
              // The house indent, so the chart's outline is the plan's outline.
              style={{ height: ROW_PX, paddingLeft: indentFor(label.depth) + 8 }}
              className="hover:bg-accent block w-full truncate pr-2 text-left text-xs"
              onClick={() => {
                onPickRow(label.id);
              }}
            >
              {label.name === '' ? '(unnamed)' : label.name}
            </button>
          ))}
        </div>

        <div className="shrink-0" style={{ width: chartWidth }}>
          {/*
            The calendar, in HTML and positioned by the same {@link DAY_PX} the
            SVG is sized by — which is what lets a browser check that a bar's
            left edge is under its own date. Inside the SVG it would be text in
            a stretched user space.
          */}
          <div data-gantt-axis className="border-border flex border-b" style={{ height: ROW_PX }}>
            {axis.map((day) => (
              <span
                key={day.workday}
                data-axis-day={day.workday}
                {...(day.date === null ? {} : { 'data-axis-date': day.date })}
                title={day.date ?? `Workday ${String(day.workday)}`}
                className="text-muted-foreground shrink-0 text-center text-[10px] leading-7"
                style={{ width: DAY_PX }}
              >
                {day.shown}
              </span>
            ))}
          </div>
          <svg
            data-gantt-chart
            // The contract, in three attributes: the user space is workdays by
            // rows, and the CSS size is the only place either becomes a pixel.
            viewBox={`0 0 ${String(chart.horizon)} ${String(rowCount)}`}
            preserveAspectRatio="none"
            width={chart.horizon * DAY_PX}
            height={rowCount * ROW_PX}
            style={{ display: 'block' }}
          >
            {axis.map((day) => (
              <line
                key={day.workday}
                x1={day.workday}
                y1={0}
                x2={day.workday}
                y2={rowCount}
                // Every fifth line heavier: five workdays is a working week,
                // and the axis holds nothing else — there are no weekends here
                // to count from.
                className={day.workday % 5 === 0 ? 'stroke-border' : 'stroke-border/40'}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {chart.brackets.map((bracket) => (
              <path
                key={bracket.rowId}
                data-gantt-bracket={bracket.rowId}
                d={
                  `M ${String(bracket.start)} ${String(bracket.rowIndex + BAR_INSET)} ` +
                  `L ${String(bracket.start)} ${String(bracket.rowIndex + ROW_MIDDLE)} ` +
                  `L ${String(bracket.finish)} ${String(bracket.rowIndex + ROW_MIDDLE)} ` +
                  `L ${String(bracket.finish)} ${String(bracket.rowIndex + BAR_INSET)}`
                }
                className="stroke-foreground fill-none"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {chart.arrows.map((arrow) => (
              <path
                key={`${arrow.predecessorId}->${arrow.successorId}`}
                data-gantt-arrow={`${arrow.predecessorId}->${arrow.successorId}`}
                d={
                  `M ${String(arrow.fromFinish)} ${String(arrow.fromRowIndex + ROW_MIDDLE)} ` +
                  `L ${String(arrow.toStart)} ${String(arrow.fromRowIndex + ROW_MIDDLE)} ` +
                  `L ${String(arrow.toStart)} ${String(arrow.toRowIndex + ROW_MIDDLE)}`
                }
                className="stroke-foreground/70 fill-none"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/*
              Drawn unlike a dependency, because it is not one: nobody wrote this
              down. It is where one person's queue put a slice behind another.
            */}
            {chart.personLinks.map((link) => (
              <path
                key={`${link.fromSliceId}->${link.toSliceId}`}
                data-gantt-person-link={`${link.fromSliceId}->${link.toSliceId}`}
                d={
                  `M ${String(link.fromFinish)} ${String(link.fromRowIndex + ROW_MIDDLE)} ` +
                  `L ${String(link.toStart)} ${String(link.toRowIndex + ROW_MIDDLE)}`
                }
                className="stroke-primary fill-none [stroke-dasharray:4_3]"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {chart.notBeforeFlags.map((flag) => (
              <path
                key={`${String(flag.rowIndex)}@${String(flag.offset)}`}
                data-gantt-not-before={flag.rowIndex}
                d={
                  `M ${String(flag.offset)} ${String(flag.rowIndex + BAR_INSET)} ` +
                  `L ${String(flag.offset + FLAG_WIDTH)} ${String(flag.rowIndex + BAR_INSET)} ` +
                  `L ${String(flag.offset)} ${String(flag.rowIndex + ROW_MIDDLE)} Z`
                }
                className="fill-foreground"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {chart.bars.map((bar) => (
              <rect
                key={bar.sliceId}
                data-gantt-bar={bar.sliceId}
                // The engine's own numbers, said twice: once as geometry the
                // browser draws and once as an attribute a test reads, so a
                // conversion creeping in between them has somewhere to be
                // caught (codex #15).
                data-start={bar.start}
                data-finish={bar.finish}
                // The last workday this bar is still on, which is the axis cell
                // its right edge stops inside rather than the one it stops at.
                // See {@link lastWorkdayOf} — it is the one number about a bar
                // that cannot be read off `x` and `width` without repeating the
                // nudge, and the browser gate has to know it to say which label
                // the edge should line up with.
                data-last-day={lastWorkdayOf(bar.start, bar.finish)}
                {...(bar.critical ? { 'data-critical': 'true' } : {})}
                x={bar.start}
                width={bar.duration}
                y={bar.rowIndex + BAR_INSET}
                height={BAR_HEIGHT}
                className={barClasses(bar.critical, bar.estimated)}
                vectorEffect="non-scaling-stroke"
                onClick={() => {
                  const rowId = rowIdAt(bar.rowIndex);
                  // A bar with no row is not a state this can be in — the bar
                  // was placed on that row by {@link layOutGantt} — so there is
                  // nothing to do about it but leave the click alone.
                  if (rowId !== undefined) onPickRow(rowId);
                }}
              >
                <title>{`${bar.floorWords}${spanWords(startDate, bar.start, bar.finish)}`}</title>
              </rect>
            ))}

            {/*
              A slice of no days is a real answer — an unestimated one, or a
              parent's leftover — and a zero-width rect draws nothing at all.
              The tick is where it starts, so the row does not read as empty.
            */}
            {chart.bars
              .filter((bar) => bar.duration === 0)
              .map((bar) => (
                <line
                  key={`${bar.sliceId}-tick`}
                  x1={bar.start}
                  y1={bar.rowIndex + BAR_INSET}
                  x2={bar.start}
                  y2={bar.rowIndex + BAR_INSET + BAR_HEIGHT}
                  className={bar.critical ? 'stroke-destructive' : 'stroke-primary'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </svg>
        </div>
      </div>
    </section>
  );
}
