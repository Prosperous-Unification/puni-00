// @vitest-environment jsdom

import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { viewportColumns, type ViewportColumn } from './plan-viewport';
import { COLUMN_OVERSCAN_PX, publicationOffset, usePlanViewport } from './use-plan-viewport';

const columns: readonly ViewportColumn[] = [
  { id: 'number', widthPx: 50, pinned: true },
  { id: 'name', widthPx: 370, pinned: false },
  { id: 'not-before', widthPx: 84, pinned: false },
  { id: 'deadline', widthPx: 84, pinned: false },
];

afterEach(() => {
  vi.restoreAllMocks();
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
