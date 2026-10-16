import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

import { MONDAY_START, planOf, pointedAtRow, rowAt, sliceAt } from './gantt-fixtures';
import type { GanttPlan } from './gantt-geometry';
import {
  barText,
  CHART_PAD_PX,
  DAY_PX,
  GanttPanel,
  labelRoomFor,
  ROW_PX,
  stackText,
} from './gantt-panel';

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

/** A bar's drawn ends in calendar cells, off its user-space rect. */
function barSpan(sliceId: string): { left: number; right: number } {
  const bar = document.querySelector(`[data-gantt-bar="${sliceId}"]`);
  if (bar === null) throw new Error(`no bar on the chart for ${sliceId}`);
  const x = Number(bar.getAttribute('x'));
  return { left: x, right: x + Number(bar.getAttribute('width')) };
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
  itDom('writes one label for a row’s laned bars, over their whole band, none over another', () => {
    drawPlan(lanedRow());

    // The laned bars write nothing of their own: a lane is half a bar's
    // height, and two 9px lines with no leading between them read as one
    // overprinted line (ui-review F-101).
    expect(document.querySelector('[data-gantt-bar-label="sand-plan"]')).toBeNull();
    expect(document.querySelector('[data-gantt-bar-label="sand-dev"]')).toBeNull();
    // Their stack writes one label instead, across the stack's whole band.
    //
    // Proof: on main, which wrote a label in each lane, this failed on
    // `sand stack label: expected null not to be null`, and with only the
    // stack label added (the lanes still labelled) on the `sand-plan` null
    // check above; watched 2026-10-16.
    const stack = document.querySelector<HTMLElement>('[data-gantt-stack-label="sand-plan"]');
    expect(stack, 'sand stack label').not.toBeNull();
    if (stack === null) return;
    expect(stack.textContent).toBe('sand · 2 steps · 1 no estimate');
    const plan = barBox('sand-plan');
    const dev = barBox('sand-dev');
    const box = labelBox(stack);
    expect(box.top).toBeCloseTo(Math.min(plan.top, dev.top), 2);
    expect(box.bottom).toBeCloseTo(Math.max(plan.bottom, dev.bottom), 2);
    // Across the drawn union of the two bars, weekend cells included.
    const left = Math.min(barSpan('sand-plan').left, barSpan('sand-dev').left);
    const right = Math.max(barSpan('sand-plan').right, barSpan('sand-dev').right);
    expect(box.left).toBeCloseTo(left * DAY_PX + CHART_PAD_PX, 2);
    expect(box.right).toBeCloseTo(right * DAY_PX + CHART_PAD_PX, 2);
    // The bar after the stack touches it and is not part of it: its own label.
    expect(document.querySelector('[data-gantt-bar-label="sand-qa"]')).not.toBeNull();

    const labels = [
      ...document.querySelectorAll<HTMLElement>('[data-gantt-bar-label], [data-gantt-stack-label]'),
    ];
    // No two label boxes overlap anywhere on the chart.
    for (const [at, first] of labels.entries()) {
      for (const second of labels.slice(at + 1)) {
        const a = labelBox(first);
        const b = labelBox(second);
        const overlap =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `${first.textContent} over ${second.textContent}`).toBe(false);
      }
    }
    // The row's number is written once per stack, never once per lane: two
    // lanes' words over each other were what read `01010.3.0606` (F-012).
    const sandLabels = labels.filter((label) => label.textContent.startsWith('sand'));
    expect(sandLabels.map((label) => label.textContent).sort()).toEqual([
      'sand · 2 steps · 1 no estimate',
      'sand · no estimate',
    ]);
  });

  it('says how many steps a stack holds and how many nobody estimated', () => {
    const room = (span: number) =>
      labelRoomFor('010.3.06', span, DAY_PX, { done: false, estimated: false });
    expect(stackText({ steps: 3, unestimated: 2 }, room(4))).toBe(
      '010.3.06 · 3 steps · 2 no estimate',
    );
    expect(stackText({ steps: 2, unestimated: 2 }, room(4))).toBe(
      '010.3.06 · 2 steps · no estimate',
    );
    // The number first and whole, as on every bar; the box crops the rest.
    expect(stackText({ steps: 2, unestimated: 2 }, room(2))).toBe(
      '010.3.06 · 2 steps · no estimate',
    );
    // 49px less the pads holds the eight-character number, not the crop mark.
    expect(stackText({ steps: 2, unestimated: 2 }, room(1.75))).toBe('010.3.06');
    expect(stackText({ steps: 2, unestimated: 2 }, room(1.5))).toBeNull();
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
    // the `?` is gone (ui-review F-037). The phrase yields to the number
    // exactly as a name does on an estimated bar: number and phrase (cropped
    // by the box) where the number and the crop mark fit, the number alone
    // where only it fits, nothing below that — the dashed outline is what
    // still says "a guess".
    //
    // Proof: on main this failed on `expected '? · 010 · KB · Strip' to be
    // '010 · no estimate'`; with the phrase ahead of the number (round 1 of
    // the review), on `expected 'no estimate' to be '010 · no estimate'` at
    // two workdays — a two-day placeholder at Days carried no number at all.
    // Watched 2026-10-14.
    const assumed = (span: number) =>
      labelRoomFor('010', span, DAY_PX, { done: false, estimated: false });
    expect(barText('KB', 'Strip', assumed(4))).toBe('010 · no estimate');
    expect(barText(null, 'Strip', assumed(3))).toBe('010 · no estimate');
    expect(barText(null, 'Strip', assumed(2))).toBe('010 · no estimate');
    expect(barText('KB', 'Strip', assumed(1))).toBe('010');
    // A number the bar cannot hold whole is not written by half.
    expect(
      barText('KB', 'Strip', labelRoomFor('170.1', 1, DAY_PX, { done: false, estimated: false })),
    ).toBeNull();

    drawPlan(lanedRow());
    const placeholder = document.querySelector('[data-gantt-bar-label="sand-qa"]');
    expect(placeholder?.textContent).toMatch(/^sand( · no estimate)?$/);
    expect(document.body.textContent).not.toContain('? ·');
  });
});
