import { describe, expect, it } from 'vitest';

import {
  CELL,
  DEEPEST_INDENT,
  indentFor,
  PINNED_COLUMNS,
  pinnedCellStyle,
  pinnedGeometry,
  STICKY_HEADER_CELL,
  TABLE_FRAME,
  tableWidth,
  UnknownColumnError,
  widthFor,
} from './table-frame';

describe('the width table', () => {
  it('is the same table the pinned offsets are prefix sums of', () => {
    // The overlap this replaces came from two width systems disagreeing: the
    // offsets assumed one set of numbers and the browser laid out another. One
    // table, read by both, is what makes that disagreement unrepresentable.
    // Proof: PINNED_COLUMNS written back out by hand with `number` at 180,
    // this failed on `expected 180 to be 168`. Watched, 2026-08-07.
    let left = 0;
    for (const { id, width } of PINNED_COLUMNS) {
      expect(pinnedGeometry(id)).toEqual({ left, width });
      expect(width).toBe(widthFor(id));
      left += width;
    }
  });

  it('has a width for every column the table renders', () => {
    for (const id of [
      'drag',
      'number',
      'name',
      'depends',
      'team',
      'final-total',
      'not-before',
      'start',
      'finish',
      'float',
      'notes',
      'actions',
    ]) {
      expect(widthFor(id)).toBeGreaterThan(0);
    }
    // A role's columns are named for a role that only exists at runtime, so
    // they are sized by suffix. One per literal in `POINTS`.
    expect(widthFor('r1-final')).toBeGreaterThan(0);
    expect(widthFor('r1-optimistic')).toBeGreaterThan(0);
    expect(widthFor('r1-realistic')).toBeGreaterThan(0);
    expect(widthFor('r1-pessimistic')).toBeGreaterThan(0);
    expect(widthFor('r1-assignee')).toBeGreaterThan(0);
  });

  it('sizes the actions column for one ⋯ button rather than two labelled ones', () => {
    // 110px was Duplicate and Delete side by side. They are one menu now, and
    // the menu hangs off this cell rather than living in it — so the column is
    // the button's own width, and the 70px it gives back is the first of the
    // ~500 this table has to lose to stop scrolling sideways at 1280.
    // Proof: written against the old 110 and watched failing on `expected 110
    // to be 40`. 2026-08-08.
    expect(widthFor('actions')).toBe(40);
  });

  it('treats an id it never renders as an error, not a plausible width', () => {
    // A default here is the bug all over again: a column nobody sized would be
    // laid out at one width and offset from another, silently.
    // Proof: the throw replaced with `return 120`, this failed on `expected
    // function to throw an error, but it didn't`. Watched, 2026-08-07.
    expect(() => widthFor('serviec')).toThrow(UnknownColumnError);
    // A typo that happens to carry a dash must not fall through the role
    // suffixes into a width either.
    expect(() => widthFor('role-dev-realsitic')).toThrow(UnknownColumnError);
  });

  it('adds a table up from its columns', () => {
    expect(tableWidth(['drag', 'number'])).toBe(widthFor('drag') + widthFor('number'));
  });

  it('makes the declared width include the cell chrome, and clips what overruns', () => {
    // `border-box` or every column is its padding wider than the offset worked
    // out from it, and the pinned edge drifts by a couple of pixels a column.
    expect(CELL.boxSizing).toBe('border-box');
    // The backstop: a descendant this plan missed cannot paint into the
    // neighbouring column, whatever it asks for.
    expect(CELL.overflow).toBe('hidden');
  });
});

describe('the pinned columns', () => {
  it('starts at the left edge and stacks each column after the last', () => {
    // The offsets are the whole of why this is a module rather than three
    // numbers in the markup: a pinned column lands beside the one in front of
    // it only if it is offset by exactly that column's width.
    expect(pinnedGeometry('drag')).toEqual({ left: 0, width: 28 });
    expect(pinnedGeometry('number')).toEqual({ left: 28, width: 168 });
    expect(pinnedGeometry('name')).toEqual({ left: 196, width: 360 });
  });

  it('leaves every other column alone', () => {
    // "Depends on" is the one this matters for: it used to sit between Number
    // and Name and now sits after them, unpinned, and it must scroll away
    // like any other column.
    expect(pinnedGeometry('depends')).toBeUndefined();
    expect(pinnedCellStyle('depends', 'body')).toBeUndefined();
    expect(pinnedCellStyle('notes', 'header')).toBeUndefined();
  });

  it('runs contiguously from the edge, with no gap between the three', () => {
    // A gap would leave the column after it hanging over whatever scrolled
    // through the hole. Asserted as a property of the list, so adding a fourth
    // pinned column cannot quietly introduce one.
    const rolling = PINNED_COLUMNS.map((column) => pinnedGeometry(column.id));
    expect(rolling[0]?.left).toBe(0);
    for (const [at, column] of rolling.entries()) {
      if (at === 0) continue;
      const before = rolling[at - 1];
      expect(column?.left).toBe((before?.left ?? -1) + (before?.width ?? -1));
    }
  });

  it('gives a pinned cell an opaque background and a layer to paint in', () => {
    // Transparent, a pinned cell shows the row scrolling behind it straight
    // through itself.
    const body = pinnedCellStyle('number', 'body');
    expect(body?.position).toBe('sticky');
    // The offset the geometry works out, on the cell that carries it.
    expect(body?.left).toBe(28);
    expect(pinnedCellStyle('name', 'body')?.left).toBe(196);
    expect(body?.background).toBe('#fff');
    expect(body?.boxSizing).toBe('border-box');
    expect(body?.zIndex).toBe(1);

    // A pinned header cell is sticky on both axes and crosses everything else,
    // so it is on top of both the header row and the pinned body cells.
    const header = pinnedCellStyle('number', 'header');
    expect(header?.background).toBe(STICKY_HEADER_CELL.background);
    expect(header?.zIndex).toBe(3);
    expect(STICKY_HEADER_CELL.zIndex).toBe(2);
  });

  it('sticks the heading to the top of the frame', () => {
    expect(STICKY_HEADER_CELL.position).toBe('sticky');
    expect(STICKY_HEADER_CELL.top).toBe(0);
    expect(STICKY_HEADER_CELL.background).not.toBe('transparent');
  });
});

describe('the indent in the Number column', () => {
  it('steps one level at a time while the tree is shallow', () => {
    expect(indentFor(0)).toBe(0);
    expect(indentFor(1)).toBe(16);
    expect(indentFor(3)).toBe(48);
  });

  it('stops growing, so the Number column cannot outgrow its declared width', () => {
    // The cap is what keeps Name, pinned at the sum of the widths in front of
    // it, from being painted over the number it is meant to sit beside.
    expect(indentFor(DEEPEST_INDENT)).toBe(indentFor(DEEPEST_INDENT + 1));
    expect(indentFor(40)).toBe(indentFor(DEEPEST_INDENT));
    // And what the cap leaves has to fit: the indent, an expander, a padlock
    // and a number of about ten characters, inside the declared 168px.
    expect(indentFor(DEEPEST_INDENT)).toBeLessThan((pinnedGeometry('number')?.width ?? 0) - 100);
  });
});

describe('the frame the table scrolls inside', () => {
  it('scrolls on both axes and is bounded, or the sticky heading means nothing', () => {
    // `overflow-x: auto` forces the other axis to compute to `auto` anyway, so
    // this element is the scrollport either way — and a scrollport as tall as
    // its own content never scrolls, which would leave `top: 0` sticking to
    // nothing while the page carried the whole frame away.
    expect(TABLE_FRAME.overflow).toBe('auto');
    expect(TABLE_FRAME.maxHeight).toBeDefined();
  });

  it('leaves room under the last row for a picker to open into', () => {
    // The dep and assignee lists are absolutely positioned at `top: 100%` and
    // 200px tall, and a scroll container clips to its padding box.
    expect(TABLE_FRAME.paddingBottom).toBe('13rem');
  });
});
