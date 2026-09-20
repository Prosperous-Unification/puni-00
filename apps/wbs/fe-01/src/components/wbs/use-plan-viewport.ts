import { type RefObject, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { CellRef } from './cell-navigation';
import {
  placeRows,
  type ViewportColumn,
  viewportColumns,
  type ViewportEntry,
  viewportRows,
  type ViewportSlice,
} from './plan-viewport';
import { recordScrollProbe, scrollProbeStart } from './scroll-performance';

/** The vertical allowance published in the measured-rendering budget. */
export const ROW_OVERSCAN_PX = 768;

/** The horizontal allowance published in the measured-rendering budget. */
export const COLUMN_OVERSCAN_PX = 256;

/** The measured one-line plan-row height used only until Chromium reports the row's own height. */
export const ESTIMATED_ROW_HEIGHT_PX = 26.1875;

/**
 * How far compositor motion may travel before React publishes another row window.
 *
 * This remains smaller than the row overscan, so the previously published slice
 * still extends beyond the visible frame throughout one bucket. Without this
 * retention, a 96px wheel step changes an overscan edge on almost every input:
 * the hook technically publishes only changed windows, but still commits once
 * per wheel event because rows cross that moving edge.
 */
export const ROW_PUBLICATION_STEP_PX = 640;

/**
 * Pins a compositor offset to the start of its retained publication bucket.
 * Negative offsets are browser overscroll rather than a logical plan position.
 */
export function publicationOffset(offsetPx: number, stepPx: number): number {
  const clampedOffsetPx = Math.max(0, offsetPx);
  return Math.floor(clampedOffsetPx / stepPx) * stepPx;
}

/**
 * Publishes the physical horizontal offset only when its mounted column window changes.
 *
 * Unlike rows, columns cannot round the offset before deriving that window: an imperative
 * `scrollIntoView()` can reveal a header inside the rounded-away part of a bucket while its body
 * cell remains unmounted. `sameWindow` below still suppresses every state write that would retain
 * the same column identities, so physical compositor motion does not fan out through React.
 */
export function columnPublicationOffset(offsetPx: number): number {
  return Math.max(0, offsetPx);
}

interface FrameViewport {
  measured: boolean;
  scrollTop: number;
  scrollLeft: number;
  heightPx: number;
  widthPx: number;
}

/** Whether two slices mount the same logical window. Pixel offsets are intentionally ignored. */
function sameWindow(left: ViewportSlice, right: ViewportSlice): boolean {
  if (left.entries.length !== right.entries.length) return false;
  return left.entries.every((entry, index) => entry.id === right.entries[index]?.id);
}

export interface PlanViewport {
  rows: ViewportSlice;
  rowLayout: readonly ViewportEntry[];
  columns: ViewportSlice;
  attachRow: (rowId: string, node: HTMLTableRowElement | null) => void;
}

/**
 * Owns the table frame's vertical viewport and the measured height of each mounted row.
 *
 * A row begins at the measured baseline and replaces that estimate after attachment. Wrapped
 * names, notes and editors therefore contribute their actual height to every later interval.
 *
 * Proof: replacing the viewport entries at `WbsTable`'s production render path with all shown
 * rows made `a broad Find renders no more than its two filter-sensitive cells per row` fail on
 * `Expected: <= 1200, Received: 1500`. Watched in Chromium, 2026-09-08.
 */
export function usePlanViewport({
  frameRef,
  rowIds,
  columns,
  pinnedCells,
  enabled,
}: {
  frameRef: RefObject<HTMLDivElement | null>;
  rowIds: readonly string[];
  columns: readonly ViewportColumn[];
  pinnedCells: readonly CellRef[];
  enabled: boolean;
}): PlanViewport {
  const [frame, setFrame] = useState<FrameViewport>(() => ({
    measured: false,
    scrollTop: 0,
    scrollLeft: 0,
    heightPx: typeof window === 'undefined' ? 900 : window.innerHeight,
    widthPx: typeof window === 'undefined' ? 1400 : window.innerWidth,
  }));
  const frameReading = useRef(frame);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  const heightReadings = useRef<ReadonlyMap<string, number>>(heights);
  const currentRowIds = useRef(rowIds);
  const pendingAnchorPx = useRef(0);
  currentRowIds.current = rowIds;
  const rowNodes = useRef(new Map<string, HTMLTableRowElement>());
  const rowIdsByNode = useRef(new Map<HTMLTableRowElement, string>());
  const rowObserver = useRef<ResizeObserver | null>(null);

  const recordHeight = useCallback(
    (rowId: string, heightPx: number) => {
      const started = scrollProbeStart();
      if (heightPx <= 0) return;
      const current = heightReadings.current;
      const previousHeight = current.get(rowId) ?? ESTIMATED_ROW_HEIGHT_PX;
      if (previousHeight === heightPx) return;
      const rowIndex = currentRowIds.current.indexOf(rowId);
      const frameNode = frameRef.current;
      if (rowIndex >= 0 && frameNode !== null) {
        const rowStartPx = currentRowIds.current
          .slice(0, rowIndex)
          .reduce((startPx, id) => startPx + (current.get(id) ?? ESTIMATED_ROW_HEIGHT_PX), 0);
        if (rowStartPx + previousHeight <= frameNode.scrollTop)
          pendingAnchorPx.current += heightPx - previousHeight;
      }
      const next = new Map(current);
      next.set(rowId, heightPx);
      heightReadings.current = next;
      setHeights(next);
      recordScrollProbe('recordHeightCalls', 'recordHeightMs', started);
    },
    [frameRef],
  );

  useLayoutEffect(() => {
    const adjustmentPx = pendingAnchorPx.current;
    if (adjustmentPx === 0) return;
    const frameNode = frameRef.current;
    if (frameNode === null) return;
    pendingAnchorPx.current = 0;
    // Apply after the new spacer extent commits; applying against the old
    // scrollHeight at the bottom would be clamped away by the browser.
    // Proof: removing this adjustment, `a measured row above the viewport
    // leaves the visible row anchored` failed on `Expected: > 2046 · Received:
    // 2046`. Watched in Chromium, 2026-09-08.
    frameNode.scrollTop += adjustmentPx;
    recordScrollProbe('anchorWrites');
  }, [frameRef, heights]);

  useLayoutEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLTableRowElement;
        const rowId = rowIdsByNode.current.get(node);
        if (rowId !== undefined) recordHeight(rowId, entry.contentRect.height);
      }
    });
    rowObserver.current = observer;
    for (const node of rowNodes.current.values()) observer.observe(node);
    return () => {
      rowObserver.current = null;
      observer.disconnect();
    };
  }, [enabled, recordHeight]);

  const attachRow = useCallback(
    (rowId: string, node: HTMLTableRowElement | null) => {
      const previous = rowNodes.current.get(rowId);
      if (previous !== undefined) {
        rowObserver.current?.unobserve(previous);
        rowIdsByNode.current.delete(previous);
        rowNodes.current.delete(rowId);
      }
      if (node === null) return;
      rowNodes.current.set(rowId, node);
      rowIdsByNode.current.set(node, rowId);
      recordHeight(rowId, node.getBoundingClientRect().height);
      rowObserver.current?.observe(node);
    },
    [recordHeight],
  );

  useLayoutEffect(() => {
    if (!enabled) return;
    const frameNode = frameRef.current;
    if (frameNode === null) return;
    let scheduledFrame: number | null = null;
    const readFrame = (): void => {
      scheduledFrame = null;
      const heightPx = frameNode.clientHeight;
      const widthPx = frameNode.clientWidth;
      if (heightPx <= 0 || widthPx <= 0) return;
      const current = frameReading.current;
      const scrollTop = publicationOffset(frameNode.scrollTop, ROW_PUBLICATION_STEP_PX);
      const scrollLeft = columnPublicationOffset(frameNode.scrollLeft);
      if (current.measured && current.heightPx === heightPx && current.widthPx === widthPx) {
        const pinnedRowIds = new Set(pinnedCells.map((cell) => cell.rowId));
        const pinnedColumnIds = new Set(pinnedCells.map((cell) => cell.columnId));
        const currentRows = viewportRows({
          rowIds,
          heights: heightReadings.current,
          estimatedHeight: ESTIMATED_ROW_HEIGHT_PX,
          scrollTop: current.scrollTop,
          viewportHeight: current.heightPx,
          overscanPx: ROW_OVERSCAN_PX,
          pinnedIds: pinnedRowIds,
        });
        const nextRows = viewportRows({
          rowIds,
          heights: heightReadings.current,
          estimatedHeight: ESTIMATED_ROW_HEIGHT_PX,
          scrollTop,
          viewportHeight: heightPx,
          overscanPx: ROW_OVERSCAN_PX,
          pinnedIds: pinnedRowIds,
        });
        const currentColumns = viewportColumns({
          columns,
          scrollLeft: current.scrollLeft,
          viewportWidth: current.widthPx,
          overscanPx: COLUMN_OVERSCAN_PX,
          pinnedIds: pinnedColumnIds,
        });
        const nextColumns = viewportColumns({
          columns,
          scrollLeft,
          viewportWidth: widthPx,
          overscanPx: COLUMN_OVERSCAN_PX,
          pinnedIds: pinnedColumnIds,
        });
        if (sameWindow(currentRows, nextRows) && sameWindow(currentColumns, nextColumns)) return;
      }
      const next = { measured: true, scrollTop, scrollLeft, heightPx, widthPx };
      frameReading.current = next;
      setFrame(next);
    };
    const scheduleRead = (): void => {
      if (scheduledFrame !== null) return;
      scheduledFrame = requestAnimationFrame(readFrame);
    };
    readFrame();
    frameNode.addEventListener('scroll', scheduleRead, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleRead);
    observer?.observe(frameNode);
    return () => {
      frameNode.removeEventListener('scroll', scheduleRead);
      observer?.disconnect();
      if (scheduledFrame !== null) cancelAnimationFrame(scheduledFrame);
    };
  }, [columns, enabled, frameRef, pinnedCells, rowIds]);

  const rows = useMemo(
    () =>
      viewportRows({
        rowIds,
        heights,
        estimatedHeight: ESTIMATED_ROW_HEIGHT_PX,
        scrollTop: frame.scrollTop,
        viewportHeight: frame.heightPx,
        overscanPx: ROW_OVERSCAN_PX,
        pinnedIds: new Set(pinnedCells.map((cell) => cell.rowId)),
      }),
    [frame, heights, pinnedCells, rowIds],
  );
  const rowLayout = useMemo(
    () => placeRows(rowIds, heights, ESTIMATED_ROW_HEIGHT_PX),
    [heights, rowIds],
  );
  const visibleColumns = useMemo(
    () =>
      viewportColumns({
        columns,
        scrollLeft: frame.scrollLeft,
        viewportWidth: frame.measured
          ? frame.widthPx
          : columns.reduce((widthPx, column) => widthPx + column.widthPx, 0),
        overscanPx: COLUMN_OVERSCAN_PX,
        pinnedIds: new Set(pinnedCells.map((cell) => cell.columnId)),
      }),
    [columns, frame.measured, frame.scrollLeft, frame.widthPx, pinnedCells],
  );
  return { rows, rowLayout, columns: visibleColumns, attachRow };
}
