import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

import { MONDAY_START, planOf, pointedAtRow, rowAt, sliceAt } from './gantt-fixtures';
import type { GanttPlan } from './gantt-geometry';
import { barText, DAY_PX, GanttPanel, labelRoomFor, ROW_PX } from './gantt-panel';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

afterEach(() => {
  cleanup();
});

function drawPlan(plan: GanttPlan): void {
  render(
    <GanttPanel
      plan={plan}
      startDate={MONDAY_START}
      scheduleError={null}
      generation={0}
      heightPx={null}
      onPickRow={() => undefined}
      onPointRow={() => undefined}
      pointed={pointedAtRow(null)}
    />,
  );
}

/** A label's box, in CSS pixels, off the inline style the panel lays it out with. */
function labelBox(label: HTMLElement): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const px = (value: string): number => Number.parseFloat(value);
  const left = px(label.style.left);
  const top = px(label.style.top);
  return { left, top, right: left + px(label.style.width), bottom: top + px(label.style.height) };
}

/** A bar's drawn box, in CSS pixels, off its user-space rect at the opening scale. */
function barBox(sliceId: string): { top: number; bottom: number } {
  const bar = document.querySelector(`[data-gantt-bar="${sliceId}"]`);
  if (bar === null) throw new Error(`no bar on the chart for ${sliceId}`);
  const y = Number(bar.getAttribute('y'));
  const height = Number(bar.getAttribute('height'));
  return { top: y * ROW_PX, bottom: (y + height) * ROW_PX };
}

/**
 * Row `sand`: three steps, two of them unestimated. Unknown slices take no
 * schedule time, so both placeholders and the estimated Impl slice start at
 * workday 3 and the row's cluster is split into lanes — the shape of
 * `010.3.06` in the 2026-10-13 review (F-012), whose two labels were painted
 * one over the other as `01010.3.0606`.
 */
const lanedRow = (): GanttPlan =>
  planOf({
    rows: [rowAt('trim', 0, 3), rowAt('sand', 3, 6, { name: 'Sanding' })],
    slices: [
      sliceAt('trim-dev', 'trim', 0, 3),
      sliceAt('sand-plan', 'sand', 3, 3, { stepId: 'plan', estimated: false, duration: 0 }),
      sliceAt('sand-dev', 'sand', 3, 6),
      sliceAt('sand-qa', 'sand', 6, 6, { stepId: 'qa', estimated: false, duration: 0 }),
    ],
    steps: [
      { id: 'plan', name: 'Plan' },
      { id: 'dev', name: 'Dev' },
      { id: 'qa', name: 'QA' },
    ],
  });

describe('the words on the bars (ui-review F-012, F-037)', () => {
  itDom('paints one label per bar, each inside its own lane, none over another', () => {
    drawPlan(lanedRow());

    const labels = [...document.querySelectorAll<HTMLElement>('[data-gantt-bar-label]')];
    const sliceIds = labels.map((label) => label.getAttribute('data-gantt-bar-label'));
    // Exactly one text node per bar: no slice carries two labels.
    expect(new Set(sliceIds).size).toBe(sliceIds.length);
    for (const label of labels) {
      const sliceId = label.getAttribute('data-gantt-bar-label') ?? '';
      expect(label.childNodes, `${sliceId} label text nodes`).toHaveLength(1);
      // Inside its own bar's lane, top to bottom.
      //
      // Proof: `labelLaneOf` put back to the whole bar's band
      // (`bar.rowIndex + BAR_INSET`, `BAR_HEIGHT`), which is what drew
      // `01010.3.0606`, and this failed on `sand-plan label bottom: expected
      // 50.96 to be less than or equal to 42.01`; watched 2026-10-13.
      const own = barBox(sliceId);
      const box = labelBox(label);
      expect(box.top, `${sliceId} label top`).toBeGreaterThanOrEqual(own.top - 0.01);
      expect(box.bottom, `${sliceId} label bottom`).toBeLessThanOrEqual(own.bottom + 0.01);
    }
    // And no two label boxes overlap anywhere on the chart.
    for (const [at, first] of labels.entries()) {
      for (const second of labels.slice(at + 1)) {
        const a = labelBox(first);
        const b = labelBox(second);
        const overlap =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(
          overlap,
          `${String(first.dataset['ganttBarLabel'])} over ${String(second.dataset['ganttBarLabel'])}`,
        ).toBe(false);
      }
    }
    // Each bar writes the row's number at most once: two lanes' words over
    // each other were what read `01010.3.0606`.
    for (const label of labels) {
      expect(label.textContent.split('sand').length - 1, label.textContent).toBeLessThanOrEqual(1);
    }
  });

  itDom('a one-day bar carries exactly one label', () => {
    drawPlan(
      planOf({
        rows: [rowAt('010', 3, 4)],
        slices: [sliceAt('010-dev', '010', 3, 4)],
      }),
    );
    const labels = document.querySelectorAll('[data-gantt-bar-label="010-dev"]');
    expect(labels).toHaveLength(1);
    expect(labels[0].childNodes).toHaveLength(1);
    expect(labels[0].textContent).toBe('010');
  });

  itDom('names a placeholder for what it is, and writes its number once per bar', () => {
    // The number leads, as it does on every bar (Dany, 2026-09-13: "every
    // title to start from the item number - and it must always be visible");
    // the `?` is gone (ui-review F-037). Number and words where both fit,
    // the words alone where only they do, nothing below that.
    //
    // Proof: on main this failed on `expected '? · 010 · KB · Strip' to be
    // '010 · no estimate'`; with the number dropped (the first F-037 cut), on
    // `expected 'no estimate' to be '010 · no estimate'`. Watched 2026-10-14.
    const assumed = (span: number) =>
      labelRoomFor('010', span, DAY_PX, { done: false, estimated: false });
    expect(barText('KB', 'Strip', assumed(4))).toBe('010 · no estimate');
    expect(barText(null, 'Strip', assumed(3))).toBe('010 · no estimate');
    expect(barText(null, 'Strip', assumed(2))).toBe('no estimate');
    // Too narrow for the words: nothing, and the dashed outline still says so.
    expect(barText('KB', 'Strip', assumed(1))).toBeNull();

    drawPlan(lanedRow());
    const placeholder = document.querySelector('[data-gantt-bar-label="sand-qa"]');
    expect(placeholder?.textContent).toMatch(/^(sand · )?no estimate$/);
    expect(document.body.textContent).not.toContain('? ·');
  });
});
