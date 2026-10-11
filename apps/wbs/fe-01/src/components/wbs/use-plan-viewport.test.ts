// @vitest-environment jsdom

import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type ViewportColumn, viewportColumns, viewportRows } from './plan-viewport';
import {
  COLUMN_OVERSCAN_PX,
  ESTIMATED_ROW_HEIGHT_PX,
  publicationOffset,
  ROW_OVERSCAN_AFTER_PX,
  ROW_OVERSCAN_BEFORE_PX,
  ROW_PUBLICATION_STEP_PX,
  usePlanViewport,
} from './use-plan-viewport';

const columns: readonly ViewportColumn[] = [
  { id: 'number', widthPx: 50, pinned: true },
  { id: 'name', widthPx: 370, pinned: false },
  { id: 'not-before', widthPx: 84, pinned: false },
  { id: 'deadline', widthPx: 84, pinned: false },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePlanViewport row publication', () => {
  it('uses one asymmetric row window across both scroll directions and frame resize', () => {
    const rowIds = Array.from({ length: 100 }, (_row, index) => `row-${String(index)}`);
    let heightPx = 805;
    const frame = document.createElement('div');
    Object.defineProperties(frame, {
      clientHeight: { configurable: true, get: () => heightPx },
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    const queued: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queued.push(callback);
      return queued.length;
    });

    let renders = 0;
    const held = renderHook(() => {
      renders += 1;
      return usePlanViewport({
        frameRef: { current: frame },
        rowIds,
        columns,
        pinnedCells: [],
        enabled: true,
      });
    });
    const mounted = () => held.result.current.rows.entries.map(({ index }) => index);
    const expected = (physicalTop: number) =>
      viewportRows({
        rowIds,
        heights: new Map(),
        estimatedHeight: ESTIMATED_ROW_HEIGHT_PX,
        scrollTop: publicationOffset(physicalTop, ROW_PUBLICATION_STEP_PX),
        viewportHeight: heightPx,
        beforePx: ROW_OVERSCAN_BEFORE_PX,
        afterPx: ROW_OVERSCAN_AFTER_PX,
      }).entries.map(({ index }) => index);
    const scrollTo = (top: number): number => {
      const rendersBefore = renders;
      frame.scrollTop = top;
      fireEvent.scroll(frame);
      const callback = queued.shift();
      if (callback === undefined) throw new Error(`scroll ${String(top)} queued no frame`);
      act(() => {
        callback(performance.now());
      });
      return renders - rendersBefore;
    };

    expect(mounted()).toEqual(expected(0));
    expect(scrollTo(96)).toBe(0);
    expect(scrollTo(ROW_PUBLICATION_STEP_PX - 1)).toBe(0);
    expect(scrollTo(ROW_PUBLICATION_STEP_PX)).toBe(1);
    expect(mounted()).toEqual(expected(ROW_PUBLICATION_STEP_PX));
    expect(scrollTo(ROW_PUBLICATION_STEP_PX * 2 - 1)).toBe(0);
    expect(scrollTo(ROW_PUBLICATION_STEP_PX - 1)).toBe(1);
    expect(mounted()).toEqual(expected(ROW_PUBLICATION_STEP_PX - 1));

    heightPx = 600;
    expect(scrollTo(ROW_PUBLICATION_STEP_PX - 1)).toBe(1);
    expect(mounted()).toEqual(expected(ROW_PUBLICATION_STEP_PX - 1));
    held.unmount();
  });
});

describe('usePlanViewport horizontal publication', () => {
  it('publishes only when physical motion crosses a logical column boundary', () => {
    const frame = document.createElement('div');
    Object.defineProperties(frame, {
      clientHeight: { configurable: true, value: 320 },
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    const queued: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queued.push(callback);
      return queued.length;
    });

    let renders = 0;
    const held = renderHook(() => {
      renders += 1;
      return usePlanViewport({
        frameRef: { current: frame },
        rowIds: ['row-1'],
        columns,
        pinnedCells: [],
        enabled: true,
      });
    });
    const mounted = () => held.result.current.columns.entries.map(({ id }) => id);
    const scrollTo = (left: number): number => {
      const rendersBefore = renders;
      frame.scrollLeft = left;
      fireEvent.scroll(frame);
      const callback = queued.shift();
      if (callback === undefined) throw new Error(`scroll ${String(left)} queued no frame`);
      act(() => {
        callback(performance.now());
      });
      return renders - rendersBefore;
    };

    expect(mounted()).not.toContain('not-before');
    expect(scrollTo(-40)).toBe(0);
    expect(scrollTo(1)).toBe(0);

    // Production-path negative: the removed 192px rounding fault maps 150px back to zero,
    // where the sticky not-before header is visible but viewportColumns omits its body cell.
    const roundedFault = viewportColumns({
      columns,
      scrollLeft: publicationOffset(150, 192),
      viewportWidth: 100,
      overscanPx: COLUMN_OVERSCAN_PX,
    });
    expect(roundedFault.entries.map(({ id }) => id)).not.toContain('not-before');

    expect(scrollTo(150)).toBe(1);
    expect(mounted()).toContain('not-before');
    expect(scrollTo(151)).toBe(0);
    held.unmount();
  });
});
