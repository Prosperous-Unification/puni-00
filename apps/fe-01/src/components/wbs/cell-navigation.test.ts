import { describe, expect, it } from 'vitest';

import { type Caret, type CellRef, type KeyModifiers, nextCell } from './cell-navigation';

const COLUMNS = ['name', 'dev-optimistic', 'dev-realistic', 'notes'];

/** Every editable cell of these rows, in document order, row by row. */
const gridOf = (rowIds: readonly string[], columns: readonly string[] = COLUMNS): CellRef[] =>
  rowIds.flatMap((rowId) => columns.map((columnId) => ({ rowId, columnId })));

const ROWS = ['strip', 'sockets', 'sand'];
const GRID = gridOf(ROWS);

const at = (rowId: string, columnId: string): CellRef => ({ rowId, columnId });
const FREE: Caret = { atStart: true, atEnd: true, hasSelection: false };
const MIDDLE: Caret = { atStart: false, atEnd: false, hasSelection: false };
const PLAIN: KeyModifiers = {
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};

const move = (
  from: CellRef,
  key: string,
  caret: Caret = FREE,
  modifiers: KeyModifiers = PLAIN,
  cells: readonly CellRef[] = GRID,
) => nextCell(cells, from, key, caret, modifiers);

describe('nextCell — up and down', () => {
  it('moves down a column, in the order the rows are shown', () => {
    expect(move(at('strip', 'dev-optimistic'), 'ArrowDown')?.to).toEqual(
      at('sockets', 'dev-optimistic'),
    );
  });

  it('moves up a column', () => {
    expect(move(at('sand', 'notes'), 'ArrowUp')?.to).toEqual(at('sockets', 'notes'));
  });

  it('stays put past the last row', () => {
    expect(move(at('sand', 'name'), 'ArrowDown')).toBeNull();
  });

  it('stays put above the first row', () => {
    expect(move(at('strip', 'name'), 'ArrowUp')).toBeNull();
  });

  it('moves rows whatever the caret is doing', () => {
    // Every cell here is a single-line input, where Up and Down do nothing at
    // all — which is what makes filling a column down forty rows possible.
    expect(move(at('strip', 'name'), 'ArrowDown', MIDDLE)?.to).toEqual(at('sockets', 'name'));
  });

  it('follows the cells it was given, which exclude a collapsed branch', () => {
    // `sockets` is a child of `strip`; collapsed, it is not on screen, and Down
    // has to land on the next row a person can actually see.
    const visible = gridOf(['strip', 'sand']);

    expect(move(at('strip', 'name'), 'ArrowDown', FREE, PLAIN, visible)?.to).toEqual(
      at('sand', 'name'),
    );
  });

  it('skips a row whose cell in that column is not editable', () => {
    // A parent's estimates are sums of what is below it and are read-only, so
    // they are not in the list. Stopping there would be a keypress that does
    // nothing, every time a branch has children.
    const ragged = [
      ...COLUMNS.map((columnId) => ({ rowId: 'leaf-a', columnId })),
      { rowId: 'parent', columnId: 'name' },
      { rowId: 'parent', columnId: 'notes' },
      ...COLUMNS.map((columnId) => ({ rowId: 'leaf-b', columnId })),
    ];

    expect(move(at('leaf-a', 'dev-optimistic'), 'ArrowDown', FREE, PLAIN, ragged)?.to).toEqual(
      at('leaf-b', 'dev-optimistic'),
    );
    // The columns that row does have are still reachable.
    expect(move(at('leaf-a', 'name'), 'ArrowDown', FREE, PLAIN, ragged)?.to).toEqual(
      at('parent', 'name'),
    );
  });
});

describe('nextCell — left and right', () => {
  it('moves to the next column when the caret is at the end', () => {
    expect(move(at('strip', 'name'), 'ArrowRight', { ...MIDDLE, atEnd: true })?.to).toEqual(
      at('strip', 'dev-optimistic'),
    );
  });

  it('moves to the previous column when the caret is at the start', () => {
    expect(
      move(at('strip', 'dev-realistic'), 'ArrowLeft', { ...MIDDLE, atStart: true })?.to,
    ).toEqual(at('strip', 'dev-optimistic'));
  });

  it('puts the caret on the edge the travel came from', () => {
    // Selecting the arriving value instead made every second press a no-op: a
    // full selection reads as `hasSelection`, so moving right across populated
    // cells took two presses each. Found in review.
    expect(move(at('strip', 'name'), 'ArrowRight', { ...MIDDLE, atEnd: true })?.caretAt).toBe(
      'start',
    );
    expect(move(at('strip', 'notes'), 'ArrowLeft', { ...MIDDLE, atStart: true })?.caretAt).toBe(
      'end',
    );
  });

  it('leaves the key alone when the caret has somewhere to go', () => {
    expect(move(at('strip', 'name'), 'ArrowRight', MIDDLE)).toBeNull();
    expect(move(at('strip', 'notes'), 'ArrowLeft', MIDDLE)).toBeNull();
  });

  it('leaves the key alone when something is selected', () => {
    // Shift+Right is extending a selection, not asking to leave the cell.
    const selecting: Caret = { atStart: true, atEnd: true, hasSelection: true };

    expect(move(at('strip', 'name'), 'ArrowRight', selecting)).toBeNull();
    expect(move(at('strip', 'notes'), 'ArrowLeft', selecting)).toBeNull();
  });

  it('does not wrap to another row', () => {
    expect(move(at('strip', 'notes'), 'ArrowRight')).toBeNull();
    expect(move(at('strip', 'name'), 'ArrowLeft')).toBeNull();
  });
});

describe('nextCell — keys that are not ours', () => {
  it('leaves an IME composition alone', () => {
    // Up and Down pick a candidate during composition. Taking them moves the
    // focus out of a half-written word and commits it.
    const composing: KeyModifiers = { ...PLAIN, isComposing: true };

    expect(move(at('strip', 'name'), 'ArrowDown', FREE, composing)).toBeNull();
    expect(move(at('strip', 'name'), 'ArrowRight', FREE, composing)).toBeNull();
  });

  it('leaves a modified arrow alone', () => {
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey'] as const) {
      expect(
        move(at('strip', 'name'), 'ArrowDown', FREE, { ...PLAIN, [modifier]: true }),
      ).toBeNull();
    }
  });

  it('ignores keys that are not arrows', () => {
    for (const key of ['Enter', 'Tab', 'a', 'Home', 'End', 'PageDown']) {
      expect(move(at('strip', 'name'), key)).toBeNull();
    }
  });

  it('leaves the key alone for a cell the grid no longer holds', () => {
    // A row deleted by someone else between the render and the keypress. The
    // browser keeps the key; nothing is guessed at.
    expect(move(at('ghost', 'name'), 'ArrowDown')).toBeNull();
    expect(move(at('strip', 'ghost'), 'ArrowDown')).toBeNull();
  });
});
