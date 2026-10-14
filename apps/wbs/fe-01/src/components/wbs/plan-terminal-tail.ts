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
 * apart. `scroll-stability.e2e.ts` measured 0.2268 of a row at 1280×800 once
 * the chart's strip took the toolbar's 32px (ui-review F-013, D5, F-055): the
 * fixed tails had matched only by the geometry of the day.
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
 * everything the arithmetic reads. The writes cannot feed back: a box that
 * scrolls is held at its height by its column, so a longer tail changes its
 * `scrollHeight` and nothing an observer here watches. A face whose rows fit
 * without a tail does not scroll and may grow with its padding, so it is left
 * on its stylesheet tail and nothing is written.
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
    const tableTailNow = Number.parseFloat(getComputedStyle(frame).paddingBottom);
    const tableRowsEnd = headingPx + lastRow.startPx + lastRow.sizePx;
    const tableExtra = frame.scrollHeight - tableRowsEnd - tableTailNow;
    const chartTailNow = allowance.getBoundingClientRect().height;
    const chartRowsEnd = lastLabel.getBoundingClientRect().bottom - panelTop + panel.scrollTop;
    const chartExtra = panel.scrollHeight - chartRowsEnd - chartTailNow;

    // A face whose rows fit without its tail does not scroll, and its height
    // may follow its padding — fitting it would chase its own answer.
    if (tableRowsEnd + tableExtra <= frame.clientHeight) return;
    if (chartRowsEnd + chartExtra <= panel.clientHeight) return;

    const tails = terminalTails(
      {
        heights: logicalRows.map(({ sizePx }) => sizePx),
        viewportPx: frame.clientHeight - headingPx - tableExtra,
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
    frame.style.setProperty(TABLE_TAIL_PROPERTY, `${String(tails.tablePx)}px`);
    panel.style.setProperty(CHART_TAIL_PROPERTY, `${String(tails.chartPx)}px`);
  };

  fit();
  if (typeof ResizeObserver === 'undefined') {
    return () => {
      frame.style.removeProperty(TABLE_TAIL_PROPERTY);
      panel.style.removeProperty(CHART_TAIL_PROPERTY);
    };
  }
  const watch = new ResizeObserver(fit);
  watch.observe(frame);
  watch.observe(panel);
  const tableBody = frame.querySelector('tbody');
  if (tableBody !== null) watch.observe(tableBody);
  const chartContent = panel.firstElementChild;
  if (chartContent !== null) watch.observe(chartContent);
  return () => {
    watch.disconnect();
    frame.style.removeProperty(TABLE_TAIL_PROPERTY);
    panel.style.removeProperty(CHART_TAIL_PROPERTY);
  };
}
