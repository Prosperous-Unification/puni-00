import type { CSSProperties } from 'react';

import { POINTS } from './estimate-draft';

/**
 * Every column the table can show by a fixed id, with the width
 * `table-layout: fixed` holds it to, in px.
 *
 * THE single source of truth for how wide anything in this table is: the
 * `<colgroup>` renders these numbers, {@link tableWidth} adds them up, and the
 * pinned offsets are prefix sums of the same numbers — so the geometry the
 * offsets assume is the geometry the browser lays out. The overlap this
 * replaces came from three width systems at once (declared px on the pinned
 * cells, auto table layout everywhere else, em-sized inputs inside the cells)
 * with no invariant tying any of them together, which is how a pinned Name
 * came to paint over "Depends on".
 *
 * A `Map` rather than a plain object because the id being looked up is a
 * column id from the table model, not a key known here: a `Record<string,
 * number>` would type every miss as a `number` and the check below as dead
 * code, which is precisely the check that must not be dead.
 */
const COLUMN_WIDTHS = new Map<string, number>([
  ['drag', 28],
  ['number', 168],
  ['name', 360],
  ['depends', 220],
  ['team', 160],
  ['final-total', 70],
  ['not-before', 130],
  ['start', 70],
  ['finish', 70],
  ['float', 90],
  ['notes', 260],
  ['actions', 110],
]);

/**
 * The widths of a role's columns, which have no fixed ids: a role is created at
 * runtime and its columns are named `<roleId>-final`, `<roleId>-<point>` and
 * `<roleId>-assignee`. Sized by suffix, because the role half of the id is
 * whatever the project called it.
 */
const ROLE_FINAL_WIDTH = 110;
const ROLE_POINT_WIDTH = 76;
const ROLE_ASSIGNEE_WIDTH = 160;

/** An id the width table has never heard of — a typo, or a new column nobody sized. */
export class UnknownColumnError extends Error {
  constructor(columnId: string) {
    super(
      `No declared width for column "${columnId}". Every rendered column ` +
        `must be in COLUMN_WIDTHS or use a role suffix — an unlisted one would ` +
        `silently get a wrong width, which is the overlap bug all over again.`,
    );
    this.name = 'UnknownColumnError';
  }
}

/**
 * How wide the column with this id is laid out, in px.
 *
 * @throws {UnknownColumnError} when nothing declares a width for that id.
 * Unknown is not OK here: a column that fell through to a default would be laid
 * out at one width while the pinned offsets were summed from another, and the
 * two disagreeing is exactly the overlap this module exists to make impossible.
 */
export function widthFor(columnId: string): number {
  const declared = COLUMN_WIDTHS.get(columnId);
  if (declared !== undefined) return declared;
  if (columnId.includes('-')) {
    if (columnId.endsWith('-final')) return ROLE_FINAL_WIDTH;
    if (columnId.endsWith('-assignee')) return ROLE_ASSIGNEE_WIDTH;
    const point = columnId.slice(columnId.lastIndexOf('-') + 1);
    if ((POINTS as readonly string[]).includes(point)) return ROLE_POINT_WIDTH;
  }
  throw new UnknownColumnError(columnId);
}

/**
 * How wide the whole table is: the sum of the columns it is currently showing.
 *
 * Set on the `<table>` so `table-layout: fixed` has a total to divide among the
 * declared columns rather than a percentage of a frame narrower than the plan.
 */
export function tableWidth(columnIds: readonly string[]): number {
  return columnIds.reduce((total, id) => total + widthFor(id), 0);
}

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
 * The widths come from {@link COLUMN_WIDTHS} rather than being repeated here:
 * each offset is the sum of the widths in front of it, so Name lands beside
 * Number only while the number this offsets by is the number the browser lays
 * Number out at. Two lists of widths is one list too many.
 */
export const PINNED_COLUMNS = (['drag', 'number', 'name'] as const).map((id) => ({
  id,
  width: widthFor(id),
}));

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
 * What every `<td>` and `<th>` carries, spread before anything a particular cell
 * adds.
 *
 * `border-box` is what makes the declared width the width including the cell's
 * own padding — without it every column is a few pixels wider than the offset
 * computed from it and the pinned edge drifts a little further with each one.
 *
 * `overflow: hidden` is the backstop. Every control in a cell is sized to follow
 * that cell, but "paints into the neighbouring column" has to be structurally
 * impossible rather than a rule each control is trusted to keep — including for
 * a descendant nobody thought about.
 *
 * It is a backstop with holes cut in it, and the rule that cuts them is worth
 * stating exactly, because this comment first stated it backwards. An
 * absolutely positioned box escapes an `overflow: hidden` ancestor only when
 * its containing block — its nearest *positioned* ancestor — is **outside**
 * that clipper. It is not enough for the containing block itself not to clip.
 * Everything in this table that must escape its cell — the dependency listbox,
 * the notes preview, a picker's list — sits in a `position: relative` wrapper
 * span that is **inside** the `<td>`, so the `<td>`'s own clip cuts it to the
 * cell rectangle no matter how the wrapper is styled. The columns carrying
 * those popovers therefore spread this and then override `overflow` to
 * `visible`; the exception, which columns it covers, and what still contains
 * those cells are written out at `opensAPopover` in `wbs-table.tsx`.
 */
export const CELL: CSSProperties = {
  boxSizing: 'border-box',
  padding: '1px 4px',
  verticalAlign: 'top',
  overflow: 'hidden',
};

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
