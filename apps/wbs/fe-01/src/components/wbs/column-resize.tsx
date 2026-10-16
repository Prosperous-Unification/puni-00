import { type Dispatch, type SetStateAction, useRef } from 'react';

import { rememberedWidthOverrides, rememberWidthOverrides } from './remembered-layout';
import { clampColumnWidth, FLEXIBLE_FLOOR, type FrameLayoutState } from './table-frame';

/**
 * How wide a column is while its resize handle is `travel` px from where it was
 * grabbed.
 *
 * The whole of the arithmetic a drag writes, kept out of the handlers so that
 * something can hold it: jsdom performs no default action for a pointer event,
 * so the gesture is provable only in a browser (`e2e/layout.spec.ts`) and this
 * is the part that is not.
 *
 * `fromWidth` is the width the column was laid out at when the handle was taken
 * — not the width it is at now, which is this function's own answer one pointer
 * move ago.
 *
 * @throws {UnknownColumnError} through {@link clampColumnWidth}, for a column
 * with no declared width to drag. Nothing renders a handle on one.
 */
export function widthFromDrag(
  columnId: string,
  fromWidth: number,
  travel: number,
  state: FrameLayoutState,
): number {
  return clampColumnWidth(columnId, fromWidth + travel, state);
}

/** What a resize handle does with the width its gesture worked out. */
export interface ColumnResize {
  /** Follows the pointer: how wide the column is drawn while the drag is in flight. */
  drag: (columnId: string, width: number) => void;
  /** The width the reader let go at, which is the one that is remembered. */
  commit: (columnId: string, width: number) => void;
  /** A `pointercancel` — the browser took the gesture away — which leaves the widths as they were. */
  abandon: () => void;
}

/**
 * The grab handle on one column header's trailing edge.
 *
 * Hand-rolled `pointerdown`/`pointermove`/`pointerup` with pointer capture,
 * rather than TanStack's own column resizing: that writes the width into the
 * column definition, which is the one place in this table a width must never
 * live — `flexRender` renders each `cell` as a component *type*, so a
 * definition that changed with a width would remount every cell in the table on
 * every pointer move (LLM_README landmine #1).
 *
 * Capture is what makes the gesture survive the pointer leaving the 6px strip,
 * which it does immediately: with it, every `pointermove` and the `pointerup`
 * are delivered here however far away they happen.
 *
 * The width the drag counts from is taken **once**, at `pointerdown`. Counting
 * from the width on screen would compound this function's own answer with every
 * move — a drag that accelerates away from the pointer.
 *
 * For the one column that resolves no width — an undragged Name — the
 * from-width is the header cell's **rendered** width, measured at
 * `pointerdown`: the only measurement in the gesture, because there is no
 * resolved number to count from and the browser is the only thing that knows
 * what the remainder-absorber is standing at. jsdom lays nothing out and
 * measures every box at 0, so a zero falls back to the column's
 * `FLEXIBLE_FLOOR`; the real from-width is provable only in Chromium
 * (`e2e/layout.spec.ts`), the same bargain {@link GanttHeightHandle} makes.
 */
export function ColumnResizeHandle({
  columnId,
  heading,
  width,
  state,
  resize,
}: {
  columnId: string;
  /** What the column is called, so the control has a name to be found by. */
  heading: string;
  /**
   * The width the column resolves to now, which a new gesture starts from —
   * or `undefined` for an undragged flexible column, whose gesture starts
   * from the rendered width instead.
   */
  width: number | undefined;
  state: FrameLayoutState;
  resize: ColumnResize;
}) {
  const grabbed = useRef<{ pointerId: number; fromX: number; fromWidth: number } | null>(null);
  const widthAt = (clientX: number, from: { fromX: number; fromWidth: number }): number =>
    widthFromDrag(columnId, from.fromWidth, clientX - from.fromX, state);

  return (
    <span
      data-resize-handle={columnId}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${heading}`}
      data-hint={`Drag to resize ${heading}`}
      onPointerDown={(event) => {
        // The browser's own answer to a press and a drag across a heading is a
        // text selection, and there is nothing in this strip to select.
        event.preventDefault();
        // Capture, so every move and the release are delivered here however far
        // the pointer has travelled — a 6px strip is not something a hand stays
        // inside.
        event.currentTarget.setPointerCapture(event.pointerId);
        const cell = event.currentTarget.closest('th');
        // The strip is rendered inside the header cell it resizes; a handle
        // with no cell above it is an invariant broken, not a state to
        // default.
        if (cell === null) throw new Error('no header cell above the resize handle');
        const measured = cell.getBoundingClientRect().width;
        grabbed.current = {
          pointerId: event.pointerId,
          fromX: event.clientX,
          fromWidth: width ?? (measured > 0 ? measured : FLEXIBLE_FLOOR),
        };
      }}
      onPointerMove={(event) => {
        const from = grabbed.current;
        // A move with no grab behind it is the pointer crossing the strip, and
        // a second pointer's move is somebody else's gesture: neither is this
        // drag.
        // Proof: replacing pointer identity checks with a null-only guard made
        // column-resize.test.tsx's matching-release test observe 3 drags instead of 2.
        if (from?.pointerId !== event.pointerId) return;
        resize.drag(columnId, widthAt(event.clientX, from));
      }}
      onPointerUp={(event) => {
        const from = grabbed.current;
        if (from?.pointerId !== event.pointerId) return;
        grabbed.current = null;
        // Proof: removing this commit made column-resize.test.tsx's matching-release
        // and measured-Name tests observe zero commits instead of one.
        resize.commit(columnId, widthAt(event.clientX, from));
      }}
      onPointerCancel={() => {
        if (grabbed.current === null) return;
        grabbed.current = null;
        resize.abandon();
      }}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 6,
        cursor: 'col-resize',
        // Or the frame under it takes a touch drag as a scroll and the column
        // never moves.
        touchAction: 'none',
        userSelect: 'none',
      }}
    />
  );
}

/** What the resize handles on the heading row do with the widths they work out. */
export function createColumnResize(
  projectId: string,
  widthOverrides: Map<string, number>,
  setWidthOverrides: Dispatch<SetStateAction<Map<string, number>>>,
): ColumnResize {
  return {
    drag: (columnId, width) => {
      // Per move, so the column follows the pointer. Only the write below is
      // held back to the end of the gesture.
      setWidthOverrides((current) => new Map(current).set(columnId, width));
    },
    commit: (columnId, width) => {
      const committed = new Map(widthOverrides).set(columnId, width);
      setWidthOverrides(committed);
      rememberWidthOverrides(projectId, committed);
    },
    abandon: () => {
      // A `pointercancel` is the browser taking the gesture — a system gesture,
      // a lost device — and what it leaves behind is the last width this
      // render saw rather than a half-finished one. Re-read from storage
      // rather than remembered in a ref: the storage is the last committed
      // answer by construction.
      setWidthOverrides(rememberedWidthOverrides(projectId).value);
    },
  };
}
