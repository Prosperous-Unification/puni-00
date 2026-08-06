/** A cell, named by the row and column it sits in rather than by an index. */
export interface CellRef {
  rowId: string;
  columnId: string;
}

/**
 * The rows on screen and the columns worth stopping on, both in display order.
 *
 * The rows are the ones the table is rendering, not the whole tree: a collapsed
 * branch's children are not among them, so moving down lands on the next row a
 * person can see. The columns exclude the derived number, the drag handle and the
 * row actions — the first cannot be edited, and the other two are buttons Tab
 * already reaches.
 */
export interface CellGrid {
  rowIds: readonly string[];
  columnIds: readonly string[];
}

/** What the caret in the focused input is doing, so this function need not look. */
export interface Caret {
  atStart: boolean;
  atEnd: boolean;
  hasSelection: boolean;
}

/**
 * Where an arrow key should move the focus, or `null` to leave the key alone.
 *
 * `null` is not a failure: it is how "the browser should handle this" is said.
 * Left with the caret mid-word means move the caret, and hijacking that would
 * break typing in the cells this table exists to type into.
 *
 * Up and Down have no such conflict — every cell is a single-line input, where
 * those keys do nothing — so they move rows whatever the caret is doing.
 */
export function nextCell(grid: CellGrid, from: CellRef, key: string, caret: Caret): CellRef | null {
  const rowIndex = grid.rowIds.indexOf(from.rowId);
  const columnIndex = grid.columnIds.indexOf(from.columnId);
  // Unknown is not OK. A cell the grid does not hold is a stale reference in the
  // caller, not a position to guess a neighbour for.
  if (rowIndex === -1 || columnIndex === -1) return null;

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const target = grid.rowIds.at(rowIndex + (key === 'ArrowDown' ? 1 : -1));
    // No wrapping at the ends: running out of rows is not a request to go to the
    // other end of the table. Proof: wrapping to `rowIds[0]` instead failed both
    // `stays put past the last row` and `stays put above the first row`.
    //
    // `.at()` rather than `[]` because `.at(-1)` is the *last* row, and an
    // index of `-1` is exactly what Up on the first row produces — the bug this
    // guard would otherwise have to catch after the fact.
    if (target === undefined || rowIndex + (key === 'ArrowDown' ? 1 : -1) < 0) return null;
    return { rowId: target, columnId: from.columnId };
  }

  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;

  // A selection means Shift is extending it, not asking to leave — and an empty
  // input reports the caret at both ends at once, so without this check every
  // arrow key in an empty cell would jump out of it.
  // Proof: this line deleted and only `leaves the key alone when something is
  // selected` failed.
  if (caret.hasSelection) return null;
  // Proof: these two lines deleted and only `leaves the key alone when the caret
  // has somewhere to go` failed — every mid-word arrow left the cell.
  const leaving = key === 'ArrowRight' ? caret.atEnd : caret.atStart;
  if (!leaving) return null;

  const columnTarget = columnIndex + (key === 'ArrowRight' ? 1 : -1);
  const target = grid.columnIds.at(columnTarget);
  if (target === undefined || columnTarget < 0) return null;
  return { rowId: from.rowId, columnId: target };
}
