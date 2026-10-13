import { cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

import { MONDAY_START, planOf, pointedAtRow, rowAt, sliceAt } from './gantt-fixtures';
import { CHART_PAD_PX, GanttPanel, LABEL_COLUMN_PX } from './gantt-panel';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

afterEach(() => {
  cleanup();
});

/** The scroll box's width a 1440px window gives the panel. */
const PANEL_PX = 1200;

/** Ten workdays of work and a quarter-day slice, drawn at Months (4px a day). */
function drawShortPlanAtMonths(): void {
  render(
    <GanttPanel
      plan={planOf({
        rows: [rowAt('hull', 0, 10), rowAt('trim', 10, 10.25)],
        slices: [sliceAt('hull-dev', 'hull', 0, 10), sliceAt('trim-dev', 'trim', 10, 10.25)],
      })}
      startDate={MONDAY_START}
      scheduleError={null}
      generation={0}
      heightPx={null}
      dayPx={4}
      onPickDayPx={() => undefined}
      onPickRow={() => undefined}
      onPointRow={() => undefined}
      pointed={pointedAtRow(null)}
    />,
  );
  const panel = document.querySelector('[data-gantt-panel]');
  if (!(panel instanceof HTMLElement)) throw new Error('the panel is not on the page');
  // jsdom lays nothing out; give the box the width a browser would have, and
  // take the panel's own re-measure path to read it.
  Object.defineProperty(panel, 'clientWidth', { value: PANEL_PX, configurable: true });
  fireEvent.scroll(panel);
}

describe('a short plan at a coarse rung (ui-review F-026)', () => {
  itDom('draws the calendar on to the panel edge rather than stopping at the plan', () => {
    drawShortPlanAtMonths();
    const room = PANEL_PX - LABEL_COLUMN_PX - 2 * CHART_PAD_PX;
    // Proof: the horizon left at the schedule's own, and this failed on
    // `expected 15 to be greater than or equal to 250`; watched 2026-10-13.
    expect(document.querySelectorAll('[data-axis-day]').length).toBeGreaterThanOrEqual(
      Math.floor(room / 4),
    );
    const chart = document.querySelector('[data-gantt-chart]');
    const drawnPx = Number(chart?.getAttribute('width'));
    // Up to the edge and not past it: past it is a scrollbar for nothing.
    expect(drawnPx).toBeLessThanOrEqual(PANEL_PX - LABEL_COLUMN_PX);
    expect(drawnPx).toBeGreaterThan(PANEL_PX - LABEL_COLUMN_PX - 4);
  });

  itDom('paints a quarter-day bar no narrower than 4px', () => {
    drawShortPlanAtMonths();
    const bar = document.querySelector('[data-gantt-bar="trim-dev"]');
    // Proof: the 4px floor scoped back to sub-day rungs, and this failed on
    // `expected 1 to be greater than or equal to 4`; watched 2026-10-13.
    expect(Number(bar?.getAttribute('width')) * 4).toBeGreaterThanOrEqual(4);
  });
});
