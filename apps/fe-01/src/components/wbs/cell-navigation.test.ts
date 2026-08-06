import { describe, expect, it } from 'vitest';

import { type Caret, type CellRef, nextCell } from './cell-navigation';

const ROWS = ['strip', 'sockets', 'sand'];
const COLUMNS = ['name', 'dev-optimistic', 'dev-realistic', 'notes'];

const at = (rowId: string, columnId: string): CellRef => ({ rowId, columnId });
const FREE: Caret = { atStart: true, atEnd: true, hasSelection: false };
const MIDDLE: Caret = { atStart: false, atEnd: false, hasSelection: false };

const move = (from: CellRef, key: string, caret: Caret = FREE) =>
  nextCell({ rowIds: ROWS, columnIds: COLUMNS }, from, key, caret);

describe('nextCell — up and down', () => {
  it('moves down a column, in the order the rows are shown', () => {
    expect(move(at('strip', 'dev-optimistic'), 'ArrowDown')).toEqual(
      at('sockets', 'dev-optimistic'),
    );
  });

  it('moves up a column', () => {
    expect(move(at('sand', 'notes'), 'ArrowUp')).toEqual(at('sockets', 'notes'));
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
    expect(move(at('strip', 'name'), 'ArrowDown', MIDDLE)).toEqual(at('sockets', 'name'));
  });

  it('follows the rows it was given, which exclude a collapsed branch', () => {
    // `sockets` is a child of `strip`; collapsed, it is not on screen, and Down
    // has to land on the next row a person can actually see.
    const visible = { rowIds: ['strip', 'sand'], columnIds: COLUMNS };

    expect(nextCell(visible, at('strip', 'name'), 'ArrowDown', FREE)).toEqual(at('sand', 'name'));
  });
});

describe('nextCell — left and right', () => {
  it('moves to the next column when the caret is at the end', () => {
    expect(move(at('strip', 'name'), 'ArrowRight', { ...MIDDLE, atEnd: true })).toEqual(
      at('strip', 'dev-optimistic'),
    );
  });

  it('moves to the previous column when the caret is at the start', () => {
    expect(move(at('strip', 'dev-realistic'), 'ArrowLeft', { ...MIDDLE, atStart: true })).toEqual(
      at('strip', 'dev-optimistic'),
    );
  });

  it('leaves the key alone when the caret has somewhere to go', () => {
    expect(move(at('strip', 'name'), 'ArrowRight', MIDDLE)).toBeNull();
    expect(move(at('strip', 'notes'), 'ArrowLeft', MIDDLE)).toBeNull();
  });

  it('leaves the key alone when something is selected', () => {
    // Shift+Right is extending a selection, not asking to leave the cell — and
    // an empty input reports the caret at both ends at once.
    const selecting: Caret = { atStart: true, atEnd: true, hasSelection: true };

    expect(move(at('strip', 'name'), 'ArrowRight', selecting)).toBeNull();
    expect(move(at('strip', 'notes'), 'ArrowLeft', selecting)).toBeNull();
  });

  it('does not wrap to another row', () => {
    expect(move(at('strip', 'notes'), 'ArrowRight')).toBeNull();
    expect(move(at('strip', 'name'), 'ArrowLeft')).toBeNull();
  });
});

describe('nextCell — anything else', () => {
  it('ignores keys that are not arrows', () => {
    for (const key of ['Enter', 'Tab', 'a', 'Home', 'End', 'PageDown']) {
      expect(move(at('strip', 'name'), key)).toBeNull();
    }
  });

  it('refuses a cell the grid does not contain', () => {
    // Unknown is not OK: a stale reference is a bug in the caller, not a
    // position to guess at.
    expect(move(at('ghost', 'name'), 'ArrowDown')).toBeNull();
    expect(move(at('strip', 'ghost'), 'ArrowDown')).toBeNull();
  });
});
