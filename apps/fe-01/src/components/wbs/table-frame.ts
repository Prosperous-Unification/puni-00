import type { CSSProperties } from 'react';

/**
 * The columns held at the left edge while the table is scrolled sideways, in
 * order from that edge, each with the width it is held to.
 *
 * Contiguity from the edge is not a preference: `position: sticky; left` pins a
 * cell at a fixed offset, so a pinned column with an unpinned one in front of it
 * would hang over whatever scrolled through the gap. That is why "Depends on"
 * sits to the right of Name rather than between it and Number —
 * `openspec/changes/sticky-table-frame/proposal.md` has the reversal written
 * down.
 *
 * The widths are declared rather than measured because each offset is the sum of
 * the widths in front of it: Name lands beside Number only if Number's width is
 * known. Only `drag` and `number` are load-bearing that way. Name is last, so
 * nothing is positioned from its width — it is a suggestion, and the textarea
 * inside it already asks for about this much.
 */
export const PINNED_COLUMNS = [
  { id: 'drag', width: 28 },
  { id: 'number', width: 168 },
  { id: 'name', width: 360 },
] as const;

/** How many levels the Number column indents a row before it stops. */
export const DEEPEST_INDENT = 4;

const INDENT_STEP = 16;

/**
 * The Number cell's indent for a row `depth` levels down, in px.
 *
 * The cap is what keeps the pinned columns from overlapping. Number is held to a
 * declared width, and an indent that kept growing would push the number itself
 * past that width — where Name, pinned at the sum of the widths in front of it,
 * would paint straight over it once the table is scrolled sideways. Past
 * {@link DEEPEST_INDENT} levels a row stops moving right; the number printed in
 * the cell still says how deep it is.
 */
export const indentFor = (depth: number): number => Math.min(depth, DEEPEST_INDENT) * INDENT_STEP;

const PINNED_GEOMETRY = new Map<string, { left: number; width: number }>(
  PINNED_COLUMNS.map((column, at) => [
    column.id,
    {
      left: PINNED_COLUMNS.slice(0, at).reduce((total, before) => total + before.width, 0),
      width: column.width,
    },
  ]),
);

/** Where a pinned column sits, or nothing when that column is not pinned. */
export function pinnedGeometry(columnId: string): { left: number; width: number } | undefined {
  return PINNED_GEOMETRY.get(columnId);
}

const HEADER_BACKGROUND = '#f4f4f4';
const ROW_BACKGROUND = '#fff';

/**
 * Which sticky cell paints over which. A pinned header cell is sticky on both
 * axes and crosses every other one, so it is on top; the header row crosses the
 * body; a pinned body cell only crosses the cells scrolling behind it.
 *
 * The pickers inside the cells sit at `z-index: 10` and above, deliberately
 * higher than all three: an open list has to be readable over a pinned column,
 * and it closes the moment the person is done with it.
 */
const PINNED_BODY_LAYER = 1;
const HEADER_LAYER = 2;
const PINNED_HEADER_LAYER = 3;

/**
 * What every header cell carries so the column headings survive scrolling a long
 * plan.
 *
 * On the cells rather than on `<thead>`: sticky on a row group is the newer of
 * the two — Chrome 91, Safari 15 — while sticky on `th` has worked for as long
 * as sticky has. The background is what makes it an opaque strip rather than a
 * heading with rows sliding through it.
 */
export const STICKY_HEADER_CELL: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: HEADER_LAYER,
  background: HEADER_BACKGROUND,
};

/**
 * What one cell carries because its column is pinned, or nothing when it is not.
 *
 * The background is not decoration. A sticky cell keeps its place while the rest
 * of its row scrolls behind it, and a transparent one shows that row straight
 * through itself — two sets of numbers on top of each other and no way to tell
 * which is which. `box-sizing` is the same kind of load-bearing: the declared
 * width has to include the cell's own padding, or every column is a couple of
 * pixels wider than the offset computed from it and the pinned edge drifts.
 */
export function pinnedCellStyle(
  columnId: string,
  part: 'header' | 'body',
): CSSProperties | undefined {
  const pinned = pinnedGeometry(columnId);
  if (pinned === undefined) return undefined;
  return {
    position: 'sticky',
    left: pinned.left,
    width: pinned.width,
    boxSizing: 'border-box',
    background: part === 'header' ? HEADER_BACKGROUND : ROW_BACKGROUND,
    zIndex: part === 'header' ? PINNED_HEADER_LAYER : PINNED_BODY_LAYER,
  };
}

/**
 * The frame the table scrolls inside, so the page never scrolls sideways.
 *
 * `overflow` on both axes rather than `overflow-x` alone, because there is no
 * such thing as one axis here: `overflow-x: auto` forces the other axis to
 * compute to `auto` as well, and this element becomes the scroll container
 * either way. That is also why the height is bounded. A sticky heading sticks to
 * the scrollport that actually scrolls, and a frame as tall as its own table
 * never scrolls vertically — the whole frame would ride up the page with the
 * header inside it, which is the failure this exists to remove.
 *
 * `16rem` is the chrome above the table on the project page: the page padding,
 * the heading, the signed-in line, the project picker and this table's own
 * toolbar. Approximate on purpose and safe in both directions — too generous
 * only means the page scrolls a little as well, too mean only means blank space
 * under the frame. A short window falls back to `minHeight`, and then the page
 * scrolls; the exact remaining height would need a full-height flex layout from
 * `main` down, which is a bigger change than this one.
 *
 * The bottom padding is room for the pickers to open into. They are absolutely
 * positioned inside their cells at `top: 100%` and up to 200px tall, and a
 * scroll container clips to its padding box — without the padding a picker on
 * the last row would need the frame scrolled before it could be read. The notes
 * preview is taller than this (320px) and still can.
 */
export const TABLE_FRAME: CSSProperties = {
  overflow: 'auto',
  maxHeight: 'calc(100vh - 16rem)',
  minHeight: '20rem',
  paddingBottom: '13rem',
};
