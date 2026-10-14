import { describe, expect, it } from 'vitest';

import { endPosition, rowsBelow, terminalTails } from './plan-terminal-tail';

describe('where a face scrolled to its end stands', () => {
  it('is the row and fraction that leave the room filled with rows below it', () => {
    // Five 28px rows; 70px of room is the last two and a half of the third.
    expect(endPosition([28, 28, 28, 28, 28], 70)).toBeCloseTo(2.5);
    expect(rowsBelow([28, 28, 28, 28, 28], 2.5)).toBeCloseTo(70);
  });

  it('is the first row when everything fits, and nothing when the tail fills the screen', () => {
    expect(endPosition([28, 28], 100)).toBe(0);
    expect(endPosition([28, 28], 0)).toBeNull();
  });
});

describe('the two faces’ tails', () => {
  const chartRows = Array.from({ length: 50 }, () => 28);
  // Every fifth table row wraps, as the scroll-stability fixture's names do.
  const tableRows = chartRows.map((_, index) => (index % 5 === 4 ? 46 : 28));

  it('end both faces on the same row and fraction', () => {
    for (const [tableViewport, chartViewport] of [
      [600, 290],
      [300, 290],
      [900, 500],
      [400, 120],
    ] as const) {
      const tails = terminalTails(
        { heights: tableRows, viewportPx: tableViewport, floorPx: 208 },
        { heights: chartRows, viewportPx: chartViewport, floorPx: 0 },
      );
      if (tails === null) throw new Error('expected tails for a plan this long');
      expect(tails.tablePx).toBeGreaterThanOrEqual(208);
      expect(tails.chartPx).toBeGreaterThanOrEqual(0);
      const tableEnd = endPosition(tableRows, tableViewport - tails.tablePx);
      const chartEnd = endPosition(chartRows, chartViewport - tails.chartPx);
      if (tableEnd === null || chartEnd === null) throw new Error('both faces show a row');
      expect(tableEnd).toBeCloseTo(chartEnd, 6);
    }
  });

  it('keeps the table at its picker room when the chart can take up the difference', () => {
    expect(
      terminalTails(
        { heights: tableRows, viewportPx: 400, floorPx: 208 },
        { heights: chartRows, viewportPx: 290, floorPx: 0 },
      )?.tablePx,
    ).toBe(208);
  });

  it('refuses faces that do not draw the same rows', () => {
    expect(
      terminalTails(
        { heights: [28, 28], viewportPx: 400, floorPx: 208 },
        { heights: [28], viewportPx: 290, floorPx: 0 },
      ),
    ).toBeNull();
  });
});
