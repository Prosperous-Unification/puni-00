import type { ViewportEntry } from './plan-viewport';
import { PLAN_TERMINAL_ALLOWANCE_REM } from './table-frame';

/**
 * The room after the last row on each of the plan's two faces, sized so the
 * table and the chart **end on the same row** whatever their heights.
 *
 * {@link linkPlanScroll} holds the two faces on one row by moving the follower,
 * and that only works while the follower can reach the row: a face scrolled to
 * its end shows, at the top, the row that leaves `viewport − tail` pixels of
 * rows below it — and with one fixed 13rem tail on both faces that is a
 * different row on each whenever their viewports or row heights differ (a
 * wrapped name makes a 46px table row against the chart's fixed 28). The
 * follower then clamps at its own end and the faces stop a fraction of a row
 * apart. `scroll-stability.e2e.ts` measured 0.2268 of a row at 1280×800 with
 * the chart's strip at the toolbar's 32px (ui-review F-013, D5, F-055), and
 * 2.63 rows at a 600px window with the 16px strip: the fixed tails matched
 * only by the geometry of the day.
 *
 * So the tails are worked out from both faces: the table keeps its picker
 * room ({@link PLAN_TERMINAL_ALLOWANCE_REM}) as a floor, and whichever face would
 * stop short of the other's end gets exactly the tail that ends it on the same
 * row and fraction. The chart has no floor of its own — it has no pickers.
 */

/** One face as the tail arithmetic needs it. */
export interface TailFace {
  /** Every row's height in CSS pixels, in order. */
  heights: readonly number[];
  /** The rows' room on screen: the scroll box's height under its sticky heading. */
  viewportPx: number;
  /** The least tail this face may have. */
  floorPx: number;
}

/**
 * Where a face scrolled to its end stands, as a row index plus the fraction of
 * that row above the heading — the position {@link alignmentMove} carries
 * between the faces — or `null` when its end shows no row at the top (the tail
 * is taller than the viewport) and so there is nothing to agree about.
 *
 * `roomPx` is the viewport less the tail: the rows from the end position to the
 * last row fill exactly that.
 */
export function endPosition(heights: readonly number[], roomPx: number): number | null {
  if (roomPx <= 0) return null;
  let below = 0;
  for (let index = heights.length - 1; index >= 0; index -= 1) {
    const height = heights[index] ?? 0;
    if (below + height >= roomPx) {
      // `height > 0` here: `below + height >= roomPx > below`.
      return index + (below + height - roomPx) / height;
    }
    below += height;
  }
  return 0;
}

/** The pixels of rows from `position` to the last row. */
export function rowsBelow(heights: readonly number[], position: number): number {
  const whole = Math.floor(position);
  let total = (1 - (position - whole)) * (heights[whole] ?? 0);
  for (let index = whole + 1; index < heights.length; index += 1) total += heights[index] ?? 0;
  return total;
}

/**
 * The two tails in CSS pixels, or `null` when the faces cannot be made to end
 * together: a face whose own end shows no row, or two faces with different row
 * counts (two commits that disagree for a tick, as in {@link alignmentMove}).
 *
 * The table's end at its floor is tried first, and the chart takes whatever
 * tail ends it there. When even no tail cannot (the chart's viewport is shorter
 * than the table's last screen of rows), the chart keeps its floor and the
 * table's tail grows until the table ends on the chart's row instead. Either
 * way each face's end is the other's, so neither follower clamps.
 */
export function terminalTails(
  table: TailFace,
  chart: TailFace,
): { tablePx: number; chartPx: number } | null {
  if (table.heights.length !== chart.heights.length) return null;
  const tableEnd = endPosition(table.heights, table.viewportPx - table.floorPx);
  if (tableEnd === null) return null;
  const chartTail = chart.viewportPx - rowsBelow(chart.heights, tableEnd);
  if (chartTail >= chart.floorPx) return { tablePx: table.floorPx, chartPx: chartTail };
  const chartEnd = endPosition(chart.heights, chart.viewportPx - chart.floorPx);
  if (chartEnd === null) return null;
  return {
    tablePx: table.viewportPx - rowsBelow(table.heights, chartEnd),
    chartPx: chart.floorPx,
  };
}

/** Sets one tail in whole pixels, and only when it changes. */
function writeTail(box: HTMLElement, property: string, px: number): void {
  const value = `${String(px)}px`;
  if (box.style.getPropertyValue(property) === value) return;
  box.style.setProperty(property, value);
}

/** The custom property the table frame's bottom padding reads. */
export const TABLE_TAIL_PROPERTY = '--plan-table-tail';
/** The custom property the chart's terminal allowance reads. */
export const CHART_TAIL_PROPERTY = '--plan-chart-tail';

/**
 * Keeps both tails fitted while the two faces are on screen, and returns the
 * way to stop — which also hands both faces back their stylesheet tails.
 *
 * Writes the two custom properties rather than React state: the tails are
 * layout read off layout, a render per resize would re-render the memoised
 * chart for a number only CSS reads, and React never sets these properties so
 * it never writes over them.
 *
 * Re-fitted on every resize of either box or of either face's rows, which is
 * everything the arithmetic reads. The frame and the panel are observed by
 * their **border box**: the table's tail is the frame's `padding-bottom`, and
 * under border-box sizing a padding write moves the content box, so a
 * content-box observer re-fired on every write — an observer loop every frame
 * with a chart dragged short (PR #472 review: 79 `ResizeObserver loop`
 * errors per 2 s), and after a window resize a fit taken on the transient
 * layout that no later content-box change ever corrected, leaving the table's
 * end blank. The border box is what the column gives the frame, so the write
 * cannot re-trigger the observer; it still sees the frame settle after a
 * resize. The tails are whole pixels and an unchanged value is not written,
 * so a refit on the same layout is a no-op, and the table's tail never
 * exceeds its viewport less the last row, so its end always shows a row.
 *
 * A face whose rows fit without a tail does not scroll and may grow with its
 * padding, so it is left on its stylesheet tail and nothing is written.
 *
 * Does nothing while the chart draws no terminal allowance (a short plan, or
 * full screen): the chart then does not end on a row of its own.
 *
 * @throws When the frame has no heading cell or the panel no axis — the same
 * invariants {@link rendererFace} and {@link panelFace} throw on.
 */
export function fitPlanTerminalTails(
  frame: HTMLElement,
  panel: HTMLElement,
  logicalRows: readonly ViewportEntry[],
): () => void {
  const heading = frame.querySelector('thead th');
  if (heading === null) {
    throw new Error('the plan frame has no heading cell to measure its viewport from');
  }
  const table = heading.closest('table');
  if (table === null) {
    throw new Error('the plan frame has a heading cell outside any table');
  }
  const axis = panel.querySelector('[data-gantt-axis]');
  if (axis === null) {
    throw new Error('the Gantt panel has no calendar axis to measure its viewport from');
  }

  const fit = (): void => {
    const allowance = panel.querySelector<HTMLElement>('[data-gantt-terminal-allowance]');
    if (allowance === null) return;
    const labels = panel.querySelectorAll('[data-gantt-label]');
    const lastLabel = labels.item(labels.length - 1);
    const lastRow = logicalRows.at(-1);
    if (lastRow === undefined || labels.length === 0) return;

    const frameTop = frame.getBoundingClientRect().top + frame.clientTop;
    const panelTop = panel.getBoundingClientRect().top + panel.clientTop;
    const headingPx = heading.getBoundingClientRect().bottom - frameTop;
    const axisPx = axis.getBoundingClientRect().bottom - panelTop;

    // What sits below the last row besides the tail itself, read off the
    // laid-out boxes so a footer either face grows later is accounted for.
    // The table's from the table box, not from `scrollHeight`: that is an
    // integer holding the fractional padding being written, and mixing the two
    // drifted the answer by a fraction of a pixel on every refit.
    const tableRowsEnd = headingPx + lastRow.startPx + lastRow.sizePx;
    const tableExtra =
      table.getBoundingClientRect().bottom - frameTop + frame.scrollTop - tableRowsEnd;
    const chartTailNow = allowance.getBoundingClientRect().height;
    const chartRowsEnd = lastLabel.getBoundingClientRect().bottom - panelTop + panel.scrollTop;
    const chartExtra = panel.scrollHeight - chartRowsEnd - chartTailNow;

    // A face whose rows fit without its tail does not scroll, and its height
    // may follow its padding — fitting it would chase its own answer.
    if (tableRowsEnd + tableExtra <= frame.clientHeight) return;
    if (chartRowsEnd + chartExtra <= panel.clientHeight) return;

    const tableViewportPx = frame.clientHeight - headingPx - tableExtra;
    const tails = terminalTails(
      {
        heights: logicalRows.map(({ sizePx }) => sizePx),
        viewportPx: tableViewportPx,
        // The picker room in pixels, off the root font size the `rem` means.
        floorPx:
          PLAN_TERMINAL_ALLOWANCE_REM *
          Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      },
      {
        heights: Array.from(labels, (label) => label.getBoundingClientRect().height),
        viewportPx: panel.clientHeight - axisPx - chartExtra,
        floorPx: 0,
      },
    );
    if (tails === null) return;
    // Below the viewport less the last row: a tail as tall as the viewport is
    // a table whose end shows no row at all.
    const tablePx = Math.round(Math.min(tails.tablePx, tableViewportPx - lastRow.sizePx));
    writeTail(frame, TABLE_TAIL_PROPERTY, Math.max(0, tablePx));
    writeTail(panel, CHART_TAIL_PROPERTY, Math.round(tails.chartPx));
  };

  fit();
  if (typeof ResizeObserver === 'undefined') {
    return () => {
      frame.style.removeProperty(TABLE_TAIL_PROPERTY);
      panel.style.removeProperty(CHART_TAIL_PROPERTY);
    };
  }
  // The refit runs in the next frame, coalesced, never inside the observer's
  // own delivery: a padding write there can resize a box another observer on
  // the page watches (the column's room observer), and Chromium reports that
  // as a `ResizeObserver loop` error on `window`.
  //
  // Proof: with `fit` called straight from the observer, `scroll-stability.e2e.ts`
  // `the faces end together with a chart dragged short, and the fit settles`
  // failed on `ResizeObserver loop errors` (`Expected: 0, Received: 2`) across
  // the 1100→700 resize. Watched 2026-10-15.
  let pending = 0;
  const watch = new ResizeObserver(() => {
    if (pending !== 0) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      fit();
    });
  });
  watch.observe(frame, { box: 'border-box' });
  watch.observe(panel, { box: 'border-box' });
  const tableBody = frame.querySelector('tbody');
  if (tableBody !== null) watch.observe(tableBody);
  const chartContent = panel.firstElementChild;
  if (chartContent !== null) watch.observe(chartContent);
  return () => {
    cancelAnimationFrame(pending);
    watch.disconnect();
    frame.style.removeProperty(TABLE_TAIL_PROPERTY);
    panel.style.removeProperty(CHART_TAIL_PROPERTY);
  };
}
