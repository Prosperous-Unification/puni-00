/** A cell, named by the row and column it sits in rather than by an index. */
export interface CellRef {
  rowId: string;
  columnId: string;
}

/** What the caret in the focused input is doing, so this function need not look. */
export interface Caret {
  atStart: boolean;
  atEnd: boolean;
  hasSelection: boolean;
  /**
   * Whether this box holds more than one line — a `<textarea>` rather than an
   * `<input>`.
   *
   * It decides whether Up and Down are text keys here. In a one-line box they
   * do nothing at all, which is what lets them walk a column; in the Name cell,
   * which holds the notes under the name, they are how the text is moved
   * through. See {@link nextCell}.
   */
  multiline: boolean;
}

/** Which edge of the arriving cell the caret lands on, so travel continues. */
export type Arrival = 'start' | 'end';

export interface CellMove {
  to: CellRef;
  caretAt: Arrival;
}

/**
 * Reasons to leave a key alone before the grid is even consulted.
 *
 * An IME composition uses Up and Down to pick a candidate; taking them moves the
 * focus out of a half-written word and commits it. A modifier means the person
 * asked for something else — word-wise movement, a browser shortcut — and this
 * grid has no opinion on any of them.
 */
export interface KeyModifiers {
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Where an arrow key should move the focus, or `null` to leave the key alone.
 *
 * `null` is not a failure and not a swallowed error: it is how "the browser
 * should handle this" is said. Left with the caret mid-word means move the
 * caret, and hijacking that would break typing in the cells this table exists to
 * type into. Up and Down are the same key in a box that holds more than one
 * line — see {@link Caret.multiline}, and the block below that reads it. A cell
 * that is not in the list gets the same answer for a different
 * reason — the row was removed between the render and the keypress, which is a
 * modeled condition here rather than malformed data to throw on.
 *
 * `cells` is every **editable** cell in document order, row by row. A parent's
 * roll-up figures are read-only and so are absent, which keeps focus off numbers
 * that cannot be typed into; rows are ragged as a result, which is why moving
 * down a column looks for the next row that actually has it.
 */
export function nextCell(
  cells: readonly CellRef[],
  from: CellRef,
  key: string,
  caret: Caret,
  modifiers: KeyModifiers,
): CellMove | null {
  if (modifiers.isComposing || modifiers.altKey || modifiers.ctrlKey || modifiers.metaKey) {
    return null;
  }

  const here = cells.findIndex((c) => c.rowId === from.rowId && c.columnId === from.columnId);
  if (here === -1) return null;

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    // In a box that holds more than one line, Up and Down belong to the text
    // until the caret has run out of it — the same rule Left and Right have
    // always had, on the other axis. The extremes are position 0 and the end of
    // the value, never a count of logical lines: a name wraps, so the first
    // line on screen is not the first line of the value, and one press of Up
    // walks the caret up or to 0 while the next one leaves. Nothing here
    // measures a visual line, which is why jsdom and a browser agree.
    //
    // Proof: this block deleted, `keeps ↑ and ↓ in the name until the caret has
    // run out of text` failed on `expected false to be true` — the key taken
    // and the focus moved out of a note being read. Watched, 2026-08-08. The
    // other side of it is `caretOf` in `wbs-table.tsx`, which is where
    // `multiline` comes from.
    if (caret.multiline) {
      // A selection means Shift is extending it upwards, not asking to leave —
      // and one that reaches the start of the value reads `atStart` without
      // anybody having asked for anything.
      if (caret.hasSelection) return null;
      if (!(key === 'ArrowUp' ? caret.atStart : caret.atEnd)) return null;
    }
    const rowIds = [...new Set(cells.map((c) => c.rowId))];
    const rowIndex = rowIds.indexOf(from.rowId);
    const step = key === 'ArrowDown' ? 1 : -1;
    // Onward until a row that has this column. A parent's roll-up cells are not
    // editable and so are not here; stopping on the row anyway would be a
    // keypress that does nothing, every time a branch has children.
    for (let i = rowIndex + step; i >= 0 && i < rowIds.length; i += step) {
      const found = cells.find((c) => c.rowId === rowIds[i] && c.columnId === from.columnId);
      // No wrapping at the ends: running out of rows is not a request to go to
      // the other end of the table.
      if (found !== undefined) return { to: found, caretAt: 'start' };
    }
    return null;
  }

  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;

  // A selection means Shift is extending it, not asking to leave.
  if (caret.hasSelection) return null;
  const leaving = key === 'ArrowRight' ? caret.atEnd : caret.atStart;
  if (!leaving) return null;

  const inRow = cells.filter((c) => c.rowId === from.rowId);
  const column = inRow.findIndex((c) => c.columnId === from.columnId);
  const wanted = column + (key === 'ArrowRight' ? 1 : -1);
  // `< 0` before the lookup: an index of `-1` reads as the last cell of the row
  // under `.at`, and even with `[]` a guard that only checks `undefined` would
  // have to be right about which one it is using.
  if (wanted < 0 || wanted >= inRow.length) return null;
  const target = inRow[wanted];

  // The caret lands on the edge the travel came from, so pressing the same key
  // again continues through the value the way it does in any other text field.
  //
  // Selecting the arriving value instead — which was the first version — made
  // every second press a no-op: a full selection reads as `hasSelection`, which
  // is the rule that keeps Shift+Arrow out of the grid, so moving right across
  // populated cells took two presses each. A reviewer found it, and it is the
  // whole reason this returns a caret position rather than just a cell.
  return { to: target, caretAt: key === 'ArrowRight' ? 'start' : 'end' };
}
