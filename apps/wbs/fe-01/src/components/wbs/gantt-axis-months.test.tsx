import { cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

import { planOf, pointedAtRow, rowAt, sliceAt } from './gantt-fixtures';
import { type DayPx, GanttPanel } from './gantt-panel';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

afterEach(() => {
  cleanup();
});

/** A Monday ten calendar days before October begins. */
const START = '2026-09-21';

/** Sixty workdays of work, so the axis runs from late September into December. */
function drawAt(dayPx: DayPx): void {
  render(
    <GanttPanel
      plan={planOf({
        rows: [rowAt('hull', 0, 60)],
        slices: [sliceAt('hull-dev', 'hull', 0, 60)],
      })}
      startDate={START}
      scheduleError={null}
      generation={0}
      heightPx={null}
      dayPx={dayPx}
      onPickDayPx={() => undefined}
      onPickRow={() => undefined}
      onPointRow={() => undefined}
      pointed={pointedAtRow(null)}
    />,
  );
}

const monthWordsOnAxis = (): string[] =>
  [...document.querySelectorAll('[data-gantt-axis] [data-axis-month]')].map(
    (word) => word.textContent,
  );

describe('month names on a compressed axis (ui-review F-023)', () => {
  for (const [rung, dayPx] of [
    ['Weeks', 12],
    ['Months', 4],
  ] as const) {
    itDom(`names each month where it begins, at ${rung}`, () => {
      drawAt(dayPx);
      // Proof: on main, where the compressed axis printed Mondays' day numbers
      // and nothing else, this failed on `expected [] to deeply equal [ 'Oct
      // 2026', 'Nov 2026', 'Dec 2026' ]`; watched 2026-10-13.
      expect(monthWordsOnAxis()).toEqual(['Oct 2026', 'Nov 2026', 'Dec 2026']);
      // Each name stands on the first of its month, which carries the boundary.
      const first = document.querySelector('[data-axis-date="2026-10-01"]');
      expect(first?.querySelector('[data-axis-month]')?.textContent).toBe('Oct 2026');
      expect(first?.hasAttribute('data-axis-month-start')).toBe(true);
      expect(
        document.querySelector('[data-gantt-month-boundary="2026-11-01"]'),
        'a month boundary down the chart body',
      ).not.toBeNull();
    });
  }

  itDom('leaves the day axis as it was, where every cell prints its date', () => {
    drawAt(28);
    expect(monthWordsOnAxis()).toEqual([]);
    expect(document.querySelector('[data-gantt-month-boundary]')).toBeNull();
  });

  itDom('carries the month names and boundaries into the downloaded SVG', async () => {
    const blobs: Blob[] = [];
    const urls = URL as unknown as {
      createObjectURL: (blob: Blob) => string;
      revokeObjectURL: (url: string) => void;
    };
    urls.createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return `blob:gantt-${String(blobs.length)}`;
    };
    urls.revokeObjectURL = () => undefined;
    HTMLAnchorElement.prototype.click = () => undefined;
    try {
      drawAt(12);
      const button = document.querySelector('[data-gantt-svg-download]');
      if (!(button instanceof HTMLElement)) throw new Error('no download control on the panel');
      fireEvent.click(button);
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('the downloaded blob read back as something other than text'));
        };
        reader.readAsText(blobs[0]);
      });
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const words = [...doc.querySelectorAll('text')].map((word) => word.textContent);
      // Proof: the export's month arm removed (`axisMonthWords` unused there),
      // and this failed on `expected [ 'Sep 2026', 'hull - hull', …(83) ] to
      // include 'Oct 2026'`; watched
      // 2026-10-14.
      expect(words).toContain('Oct 2026');
      // The boundary down the body travels in the cloned chart.
      expect(doc.querySelector('[data-gantt-month-boundary="2026-11-01"]')).not.toBeNull();
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
      Reflect.deleteProperty(HTMLAnchorElement.prototype, 'click');
    }
  });
});
