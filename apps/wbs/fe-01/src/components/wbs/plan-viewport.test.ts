import { describe, expect, it } from 'vitest';

import { placeRows, viewportColumns, viewportRows } from './plan-viewport';
import { publicationOffset, ROW_OVERSCAN_PX, ROW_PUBLICATION_STEP_PX } from './use-plan-viewport';

describe('plan viewport', () => {
  it('keeps a wheel-step margin while budgeting the 100-row two-step fixture model', () => {
    expect(ROW_OVERSCAN_PX - ROW_PUBLICATION_STEP_PX).toBeGreaterThanOrEqual(96);
    const rowIds = Array.from({ length: 100 }, (_row, index) => `row-${String(index)}`);
    const heights = new Map(rowIds.map((id) => [id, 28]));
    const mountedCells = [0, 50, 99].map((index) => {
      const physicalTop = index === 99 ? 2_800 : index * 28;
      const scrollTop = publicationOffset(physicalTop, ROW_PUBLICATION_STEP_PX);
      return (
        viewportRows({
          rowIds,
          heights,
          estimatedHeight: 26.1875,
          scrollTop,
          viewportHeight: 700,
          overscanPx: ROW_OVERSCAN_PX,
          pinnedIds: new Set([rowIds[0]]),
        }).entries.length * 15
      );
    });
    // This 700px/28px fixture model is a focused guard; the real Playwright
    // geometry attachment remains authority for the <=1200 product threshold.
    expect(Math.max(...mountedCells)).toBeLessThanOrEqual(1_200);
  });

  it('covers physical rows around both bucket edges after row measurement and frame resize', () => {
    const rowIds = Array.from({ length: 100 }, (_row, index) => `row-${String(index)}`);
    const initialHeights = new Map(rowIds.map((id) => [id, 28]));
    const wrappedHeights = new Map(initialHeights);
    wrappedHeights.set('row-35', 88);
    for (const heights of [initialHeights, wrappedHeights]) {
      const placed = placeRows(rowIds, heights, 26.1875);
      for (const viewportHeight of [480, 700, 900]) {
        for (const physicalTop of [
          0,
          96,
          ROW_PUBLICATION_STEP_PX - 1,
          ROW_PUBLICATION_STEP_PX,
          ROW_PUBLICATION_STEP_PX + 96,
          2 * ROW_PUBLICATION_STEP_PX - 1,
          2 * ROW_PUBLICATION_STEP_PX,
          2 * ROW_PUBLICATION_STEP_PX + 96,
        ]) {
          const publishedTop = publicationOffset(physicalTop, ROW_PUBLICATION_STEP_PX);
          const selected = new Set(
            viewportRows({
              rowIds,
              heights,
              estimatedHeight: 26.1875,
              scrollTop: publishedTop,
              viewportHeight,
              overscanPx: ROW_OVERSCAN_PX,
            }).entries.map(({ id }) => id),
          );
          const visible = placed.filter(
            ({ startPx, sizePx }) =>
              startPx < physicalTop + viewportHeight && startPx + sizePx > physicalTop,
          );
          expect(visible.every(({ id }) => selected.has(id))).toBe(true);
        }
      }
    }
  });

  it('retains compositor offsets until a row publication boundary', () => {
    expect([
      publicationOffset(0, ROW_PUBLICATION_STEP_PX),
      publicationOffset(96, ROW_PUBLICATION_STEP_PX),
      publicationOffset(ROW_PUBLICATION_STEP_PX - 1, ROW_PUBLICATION_STEP_PX),
      publicationOffset(ROW_PUBLICATION_STEP_PX, ROW_PUBLICATION_STEP_PX),
      publicationOffset(ROW_PUBLICATION_STEP_PX * 2 - 1, ROW_PUBLICATION_STEP_PX),
      publicationOffset(ROW_PUBLICATION_STEP_PX * 2, ROW_PUBLICATION_STEP_PX),
    ]).toEqual([
      0,
      0,
      0,
      ROW_PUBLICATION_STEP_PX,
      ROW_PUBLICATION_STEP_PX,
      ROW_PUBLICATION_STEP_PX * 2,
    ]);
    expect(publicationOffset(-40, ROW_PUBLICATION_STEP_PX)).toBe(0);
  });

  it('slices measured variable-height rows by viewport and overscan', () => {
    expect(
      viewportRows({
        rowIds: ['a', 'b', 'c', 'd'],
        heights: new Map([
          ['a', 20],
          ['b', 40],
          ['c', 30],
          ['d', 50],
        ]),
        estimatedHeight: 28,
        scrollTop: 45,
        viewportHeight: 30,
        overscanPx: 10,
      }),
    ).toEqual({
      beforePx: 20,
      afterPx: 50,
      entries: [
        { id: 'b', index: 1, startPx: 20, sizePx: 40 },
        { id: 'c', index: 2, startPx: 60, sizePx: 30 },
      ],
      totalPx: 140,
    });
  });

  it('uses the declared estimate only until a row has been measured', () => {
    expect(
      viewportRows({
        rowIds: ['a', 'b', 'c'],
        heights: new Map([['a', 60]]),
        estimatedHeight: 25,
        scrollTop: 50,
        viewportHeight: 20,
        overscanPx: 0,
      }).entries.map(({ id, sizePx }) => ({ id, sizePx })),
    ).toEqual([
      { id: 'a', sizePx: 60 },
      { id: 'b', sizePx: 25 },
    ]);
  });

  it('retains an explicitly pinned row outside the ordinary interval', () => {
    expect(
      viewportRows({
        rowIds: ['a', 'b', 'c', 'd', 'e'],
        heights: new Map(),
        estimatedHeight: 20,
        scrollTop: 60,
        viewportHeight: 20,
        overscanPx: 0,
        pinnedIds: new Set(['a']),
      }).entries.map(({ id }) => id),
    ).toEqual(['a', 'd']);
  });

  it('keeps pinned columns and slices the scrolling columns independently', () => {
    expect(
      viewportColumns({
        columns: [
          { id: 'number', widthPx: 50, pinned: true },
          { id: 'name', widthPx: 120, pinned: true },
          { id: 'team', widthPx: 100, pinned: false },
          { id: 'start', widthPx: 80, pinned: false },
          { id: 'finish', widthPx: 90, pinned: false },
          { id: 'depends', widthPx: 100, pinned: false },
          { id: 'assignees', widthPx: 100, pinned: false },
        ],
        scrollLeft: 230,
        viewportWidth: 180,
        overscanPx: 20,
      }),
    ).toEqual({
      beforePx: 0,
      afterPx: 200,
      entries: [
        { id: 'number', index: 0, startPx: 0, sizePx: 50 },
        { id: 'name', index: 1, startPx: 50, sizePx: 120 },
        { id: 'team', index: 2, startPx: 170, sizePx: 100 },
        { id: 'start', index: 3, startPx: 270, sizePx: 80 },
        { id: 'finish', index: 4, startPx: 350, sizePx: 90 },
      ],
      totalPx: 640,
    });
  });

  it('does not count an offscreen active column as omitted space', () => {
    expect(
      viewportColumns({
        columns: [
          { id: 'name', widthPx: 120, pinned: true },
          { id: 'team', widthPx: 100, pinned: false },
          { id: 'depends', widthPx: 100, pinned: false },
          { id: 'assignees', widthPx: 100, pinned: false },
        ],
        scrollLeft: 120,
        viewportWidth: 100,
        overscanPx: 0,
        pinnedIds: new Set(['assignees']),
      }),
    ).toEqual({
      beforePx: 0,
      afterPx: 100,
      entries: [
        { id: 'name', index: 0, startPx: 0, sizePx: 120 },
        { id: 'team', index: 1, startPx: 120, sizePx: 100 },
        { id: 'assignees', index: 3, startPx: 320, sizePx: 100 },
      ],
      totalPx: 420,
    });
  });
});
