import { describe, expect, it } from 'vitest';

import {
  CELL,
  DATE_EDITOR_WIDTH,
  DEEPEST_INDENT,
  FIXED_COLUMNS,
  FLEXIBLE_COLUMNS,
  FLEXIBLE_FLOOR,
  flexibleCellStyle,
  foldedTableMinWidth,
  frameLayout,
  type FrameLayoutState,
  indentFor,
  NUMBER_ENVELOPE,
  PINNED_COLUMN_IDS,
  pinnedCellStyle,
  pinnedGeometryFor,
  POPOVER_ROW_LAYER,
  STICKY_HEADER_CELL,
  TABLE_FRAME,
  UnknownColumnError,
  widthFor,
} from './table-frame';

/** A plan where somebody has set an earliest start, which is the wider of the two states. */
const DATED: FrameLayoutState = { hasAnyNotBefore: true };
/** A plan where nobody has. */
const UNDATED: FrameLayoutState = { hasAnyNotBefore: false };

/** Every fixed column of the table, in the order the table renders them. */
const RENDERED = [
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
  'actions',
];

/** The widths one layout declares, by column id, for reading an assertion off. */
const declared = (
  ids: readonly string[],
  state: FrameLayoutState,
): Record<string, number | undefined> =>
  Object.fromEntries(frameLayout(ids, state).columns.map((column) => [column.id, column.width]));

describe('the resolved frame layout', () => {
  it('answers the colgroup, the minimum and the pinned offsets from one resolution', () => {
    // The five consumers this replaced each did their own arithmetic and the
    // pinned offsets were prefix sums frozen at module load, which is why no
    // width could depend on the plan. One object, three answers, one call.
    const layout = frameLayout([...RENDERED, 'r1-final', 'r2-final'], DATED);

    expect(layout.columns.map((column) => column.id)).toEqual([
      ...RENDERED,
      'r1-final',
      'r2-final',
    ]);
    // Name declares nothing: it is the column that takes what the others leave.
    expect(layout.columns.find((column) => column.id === 'name')?.width).toBeUndefined();
    expect(layout.columns.find((column) => column.id === 'number')?.width).toBe(100);
    // 690px of fixed columns with a dated `not-before`, plus Name's 200px
    // floor, plus a folded column for each of two phases.
    expect(layout.minWidth).toBe(690 + FLEXIBLE_FLOOR + 2 * 96);
  });

  it('holds every pinned column at the sum of the widths the same call declared', () => {
    // The offsets are the whole of why this is a module rather than three
    // numbers in the markup: a pinned column lands beside the one in front of
    // it only if it is offset by exactly that column's width — the width this
    // render is using, not one a module-load map remembered.
    //
    // Said as a property of the resolution rather than as three numbers, so it
    // holds in a state nobody wrote a case for: whatever each pinned column
    // resolves to, the one behind it starts where that one ends. The three
    // numbers themselves are the test below.
    // Proof: `pinnedGeometryFor` made to add `ROLE_FINAL_WIDTH` instead of the
    // resolved width, this failed on `expected { left: 96, width: 100 } to
    // deeply equal { left: 24, width: 100 }`. Watched, 2026-08-09.
    for (const state of [DATED, UNDATED]) {
      const layout = frameLayout(RENDERED, state);
      let running = 0;
      for (const id of PINNED_COLUMN_IDS) {
        const width = layout.columns.find((column) => column.id === id)?.width;
        expect(layout.pinned.get(id)).toEqual({ left: running, width });
        if (width === undefined) {
          // Only the last pinned column may be flexible; see the refusal below.
          expect(id).toBe(PINNED_COLUMN_IDS.at(-1));
          continue;
        }
        running += width;
      }
    }
  });

  it('starts at the left edge and stacks each column after the last', () => {
    const { pinned } = frameLayout(RENDERED, DATED);

    expect(pinned.get('drag')).toEqual({ left: 0, width: 24 });
    expect(pinned.get('number')).toEqual({ left: 24, width: 100 });
    // Name is pinned at the sum of the two fixed columns in front of it and has
    // no width of its own — the `<colgroup>` decides that, and the browser gate
    // measures this offset at a viewport too narrow to hold the table.
    expect(pinned.get('name')).toEqual({ left: 124, width: undefined });
    // And nothing else is pinned at all. "Depends on" is the one this matters
    // for: it used to sit between Number and Name.
    expect(pinned.get('depends')).toBeUndefined();
    expect(pinnedCellStyle(frameLayout(RENDERED, DATED), 'depends', 'body')).toBeUndefined();
  });

  it('refuses an id nothing sizes, rather than handing back a plausible width', () => {
    // A default here is the overlap bug all over again: a column nobody sized
    // would be laid out at one width and offset from another, silently. The
    // throw used to fire when the module *loaded*; it has to fire per call now,
    // because the answer depends on the plan.
    //
    // Proof: `widthFor`'s `throw new UnknownColumnError(columnId)` replaced by
    // `return Number.NaN`, this failed on `expected [Function] to throw an
    // error` — and, watched in the same run, `frameLayout([...RENDERED,
    // 'serviec'], DATED)` handed back `{ id: 'serviec', width: NaN }` for that
    // `<col>` and a `minWidth` of `NaN`, a table declared narrower than it lays
    // out by a column nobody can see. Watched, 2026-08-09.
    expect(() => frameLayout([...RENDERED, 'serviec'], DATED)).toThrow(UnknownColumnError);
    // A typo carrying a dash must not fall through the role suffixes either.
    expect(() => frameLayout(['role-dev-realsitic'], DATED)).toThrow(UnknownColumnError);
    // And the width that is missing is missing from the sum as well, which is
    // the second half of the same fault: the assertion above only sees the
    // throw, so the sum is stated here as the thing the throw is protecting.
    expect(frameLayout(['drag', 'number'], DATED).minWidth).toBe(124);
  });

  it('refuses a column pinned behind a flexible one', () => {
    // A sticky offset is a sum of the widths in front of it and a flexible
    // column has none — so an offset summed past one is right at exactly one
    // window size. Name is the last pinned column today, and this is what stops
    // a fourth being added behind it in silence.
    //
    // Asked of `pinnedGeometryFor` rather than of `frameLayout`, because the
    // pinned order is a module constant and there is no other way to declare a
    // fourth pinned column: it is the same function `frameLayout` calls, with
    // the one input a test cannot otherwise vary.
    //
    // Proof: the `flexibleBefore !== null` branch deleted, this failed on
    // `expected [Function] to throw an error` — `depends` resolved to `{ left:
    // 124, width: 110 }`, a plausible offset with Name's missing width counted
    // as nothing. Watched, 2026-08-09.
    const { columns } = frameLayout(RENDERED, DATED);

    expect(() => pinnedGeometryFor(columns, [...PINNED_COLUMN_IDS, 'depends'])).toThrow(
      /cannot be pinned after it/,
    );
    // And the order the table really uses is not one of those, which is what
    // makes the refusal a guard rather than a description of today's markup.
    expect(() => pinnedGeometryFor(columns, PINNED_COLUMN_IDS)).not.toThrow();
  });

  it('has a width for every fixed column the table renders', () => {
    for (const column of frameLayout(RENDERED, DATED).columns) {
      if (FLEXIBLE_COLUMNS.has(column.id)) {
        expect(column.width).toBeUndefined();
        continue;
      }
      expect(column.width).toBeGreaterThan(0);
    }
    // A role's columns are named for a role that only exists at runtime, so
    // they are sized by suffix. One per literal in `POINTS`.
    expect(
      declared(
        ['r1-final', 'r1-optimistic', 'r1-realistic', 'r1-pessimistic', 'r1-assignee'],
        DATED,
      ),
    ).toEqual({
      'r1-final': 96,
      'r1-optimistic': 52,
      'r1-realistic': 52,
      'r1-pessimistic': 52,
      'r1-assignee': 120,
    });
  });

  it('leaves the Name column to the layout, and asks nobody for its width', () => {
    // The one column that is a sentence rather than a figure takes whatever
    // the others leave; a declared width on it is the thing that made this
    // table 500px wider than a laptop.
    // Proof: `['name', 360]` put back in `COLUMN_WIDTHS` and `name` taken out
    // of `FLEXIBLE_COLUMNS`, this failed on `expected false to be true`.
    // Watched, 2026-08-08.
    expect(FLEXIBLE_COLUMNS.has('name')).toBe(true);
    expect(() => widthFor('name', DATED)).toThrow(UnknownColumnError);
    // And the floor it may not shrink past is on the cell as well as in the
    // table's minimum.
    expect(flexibleCellStyle('name')).toEqual({ minWidth: FLEXIBLE_FLOOR });
    expect(flexibleCellStyle('depends')).toBeUndefined();
  });

  it('has no width for a Notes column, because there is no Notes column', () => {
    // The notes are typed under the name, in the Name cell. A width left
    // behind here would be 260px of table nothing renders — and, worse, a
    // colgroup that still had a `<col>` for it would shift every pinned offset
    // after it.
    // Proof: `['notes', 260]` put back in `COLUMN_WIDTHS`, this failed on
    // `expected [Function] to throw an error`. Watched, 2026-08-08.
    expect(() => widthFor('notes', DATED)).toThrow(UnknownColumnError);
    expect(FIXED_COLUMNS).not.toContain('notes');
  });

  it('compacts every fixed column to the figure it actually holds', () => {
    // The v1.1 compaction plus this change's two narrowings, pinned as
    // literals because the equations below are only true while these are. Each
    // one is a number of days, a date, a handle or a glyph — nothing here holds
    // a sentence.
    // Proof: run against the pre-compaction widths, this failed on
    // `expected { drag: 28, number: 168, …(8) } to deeply equal
    // { drag: 24, number: 100, …(8) }`. Watched, 2026-08-08.
    expect(
      declared(
        RENDERED.filter((id) => !FLEXIBLE_COLUMNS.has(id)),
        DATED,
      ),
    ).toEqual({
      drag: 24,
      number: 100,
      depends: 110,
      team: 120,
      'final-total': 52,
      'not-before': 84,
      start: 52,
      finish: 52,
      float: 56,
      actions: 40,
    });
  });
});

describe('the earliest-start column is as narrow as the plan lets it be', () => {
  it('is 84px while any row in the project sets a day, and 56px when none does', () => {
    // A width that is a fact about the plan, which is the whole reason
    // `FrameLayoutState` exists. 146 was what a native date input needed, and
    // the column held one on every row; it holds a short date now.
    // Proof: `PLAN_WIDTHS`'s `not-before` entry replaced by a constant 84,
    // this failed on `expected 84 to be 56`. Watched, 2026-08-09.
    expect(declared(['not-before'], DATED)).toEqual({ 'not-before': 84 });
    expect(declared(['not-before'], UNDATED)).toEqual({ 'not-before': 56 });
  });

  it('moves the whole table by exactly that difference and nothing else', () => {
    // Stated as the difference rather than as two totals, so a second column
    // that quietly took the state into account would show up here.
    const dated = frameLayout(RENDERED, DATED);
    const undated = frameLayout(RENDERED, UNDATED);

    expect(dated.minWidth - undated.minWidth).toBe(84 - 56);
    for (const column of dated.columns) {
      if (column.id === 'not-before') continue;
      expect(undated.columns.find((each) => each.id === column.id)?.width).toBe(column.width);
    }
  });

  it('keeps the editor wider than the column it opens in', () => {
    // The editor escapes its cell rather than sizing it, which is only a
    // sentence worth writing down while the two numbers really do disagree: a
    // column as wide as the editor is a column that never had to escape.
    expect(DATE_EDITOR_WIDTH).toBeGreaterThan(widthFor('not-before', DATED));
  });
});

describe('the width equation the table is laid out by', () => {
  it('adds a table up from its columns, budgeting the floor for the flexible one', () => {
    // The honest width equation, which is the whole of this module: the table
    // is `width: 100%` with this as its minimum, so above it nothing scrolls
    // sideways and below it the pinned columns take over.
    // Proof, both halves: the `FLEXIBLE_COLUMNS` branch in `frameLayout`
    // replaced by `widthFor(id, state)`, this failed on `UnknownColumnError:
    // No declared width for column "name"`; replaced by `0`, on `expected +0
    // to be 200`. Watched, 2026-08-09.
    expect(frameLayout(['drag', 'number'], DATED).minWidth).toBe(24 + 100);
    expect(frameLayout(['name'], DATED).minWidth).toBe(FLEXIBLE_FLOOR);

    // 690px of fixed columns with a dated `not-before`, plus Name's 200px
    // floor. The three states the browser gate measures, computed here so a
    // width change that breaks one of them fails in the repo gate rather than
    // only in a browser: two roles folded fits a 1280 laptop, three folded
    // still does, and one role unfolded does not — which is why unfolding is an
    // accordion.
    expect(frameLayout([...RENDERED, 'r1-final', 'r2-final'], DATED).minWidth).toBe(1082);
    expect(frameLayout([...RENDERED, 'r1-final', 'r2-final', 'r3-final'], DATED).minWidth).toBe(
      1178,
    );
    expect(
      frameLayout(
        [
          ...RENDERED,
          'r1-final',
          'r1-optimistic',
          'r1-realistic',
          'r1-pessimistic',
          'r1-assignee',
          'r2-final',
        ],
        DATED,
      ).minWidth,
    ).toBe(1358);
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

describe('a pinned cell', () => {
  it('gets an opaque background and a layer to paint in', () => {
    // Transparent, a pinned cell shows the row scrolling behind it straight
    // through itself.
    const layout = frameLayout(RENDERED, DATED);
    const body = pinnedCellStyle(layout, 'number', 'body');
    expect(body?.position).toBe('sticky');
    // The offset the layout works out, on the cell that carries it.
    expect(body?.left).toBe(24);
    expect(body?.width).toBe(100);
    const name = pinnedCellStyle(layout, 'name', 'body');
    expect(name?.left).toBe(124);
    // Pinned, and with no width of its own: the `<colgroup>` is the only thing
    // that sizes a flexible column, and a `width` here would be the second
    // opinion that the whole width table exists to prevent.
    // Proof: `pinnedCellStyle` made to declare `width: pinned.width ?? 360`
    // again, this failed on `expected 360 to be undefined`. Watched,
    // 2026-08-08.
    expect(name?.width).toBeUndefined();
    expect(name?.position).toBe('sticky');
    // The row's own colour, with an opaque fallback behind it: the shade is
    // `styles.css`'s to decide per row — banded, hovered, armed — and the
    // fallback is what keeps this cell opaque with that stylesheet deleted.
    expect(body?.background).toBe('var(--cell-bg, var(--background))');
    expect(body?.boxSizing).toBe('border-box');
    expect(body?.zIndex).toBe(1);

    // A pinned header cell is sticky on both axes and crosses everything else,
    // so it is on top of both the header row and the pinned body cells.
    const header = pinnedCellStyle(layout, 'number', 'header');
    expect(header?.background).toBe(STICKY_HEADER_CELL.background);
    expect(header?.zIndex).toBe(4);
    expect(STICKY_HEADER_CELL.zIndex).toBe(3);

    // And the layer a row is lifted to while a popover is open in one of its
    // pinned cells: above the body cells that would otherwise paint over it,
    // below the heading, which stays a heading.
    // Proof: observed in a browser before it existed — `4px below the name
    // cell is <textarea> in the name column, not the preview`, on h2puni,
    // 2026-08-08.
    expect(POPOVER_ROW_LAYER).toBeGreaterThan(Number(body?.zIndex));
    expect(POPOVER_ROW_LAYER).toBeLessThan(Number(STICKY_HEADER_CELL.zIndex));
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
    expect(indentFor(1)).toBe(12);
    expect(indentFor(3)).toBe(36);
  });

  it('stops growing, so the Number column cannot outgrow its declared width', () => {
    // The cap is what keeps Name, pinned at the sum of the widths in front of
    // it, from being painted over the number it is meant to sit beside.
    expect(indentFor(DEEPEST_INDENT)).toBe(indentFor(DEEPEST_INDENT + 1));
    expect(indentFor(40)).toBe(indentFor(DEEPEST_INDENT));
    // And the number keeps the larger half of its own column: the step went to
    // 12px in the same change that took the column from 168 to 100, and a step
    // left at 16 would spend 64 of those 100 on white space.
    // Proof: `INDENT_STEP` put back to 16, this failed on `expected 64 to be
    // less than 50`. Watched, 2026-08-08.
    expect(indentFor(DEEPEST_INDENT)).toBeLessThan(widthFor('number', DATED) / 2);
  });

  it('states the envelope the column is sized to, rather than a longest number', () => {
    // Eleven characters: a root label's three, plus a dotted single-character
    // segment for each level down to the deepest indent. There is no longest
    // work item number to measure instead — an insertion against a frozen
    // anchor appends a digit, unboundedly — and `e2e/layout.spec.ts` is what
    // measures this string in a browser.
    expect(NUMBER_ENVELOPE).toBe('010.1.1.1.1');
    expect(NUMBER_ENVELOPE.length).toBe(11);
  });
});

describe('the frame the table scrolls inside', () => {
  it('scrolls on both axes and is bounded, or the sticky heading means nothing', () => {
    // `overflow-x: auto` forces the other axis to compute to `auto` anyway, so
    // this element is the scrollport either way — and a scrollport as tall as
    // its own content never scrolls, which would leave `top: 0` sticking to
    // nothing while the page carried the whole frame away.
    expect(TABLE_FRAME.overflow).toBe('auto');
    // What bounds it since `H header-fits-a-row`: a zero flex basis, which is
    // the remainder of a parent whose own height is the window's. The number
    // this replaces was `maxHeight: calc(100vh - 16rem)` — an estimate of the
    // chrome above, wrong by 112px at 1280×800 in the direction that left the
    // page scrolling. A basis of `auto` here would be the frame's own content,
    // which is the unbounded case this assertion is about.
    expect(TABLE_FRAME.flex).toBe('1 1 0%');
    // Stated as well as implied: a `maxHeight` back beside the flex basis would
    // be a second opinion about this element's height, and the two would
    // disagree the moment the header changed — which is the whole fault.
    expect(TABLE_FRAME.maxHeight).toBeUndefined();
  });

  it('leaves room under the last row for a picker to open into', () => {
    // The dep and assignee lists are absolutely positioned at `top: 100%` and
    // 200px tall, and a scroll container clips to its padding box.
    expect(TABLE_FRAME.paddingBottom).toBe('13rem');
  });
});

describe('how wide the phases make the table', () => {
  it('grows by one folded column per phase, from the same widths the table sums', () => {
    // The sentence the Phases dialog prints, and the phases' own ids rather
    // than a count: every width resolves per column id now, so a figure summed
    // from invented ids would answer about columns that do not exist.
    expect(foldedTableMinWidth(['role-dev', 'role-qa'], DATED)).toBe(1082);
    expect(
      foldedTableMinWidth(['role-dev', 'role-qa', 'role-ops'], DATED) -
        foldedTableMinWidth(['role-dev', 'role-qa'], DATED),
    ).toBe(widthFor('anything-final', DATED));
    // And it answers the narrow state too, which is the fact a count could
    // never carry into it.
    expect(foldedTableMinWidth(['role-dev', 'role-qa'], UNDATED)).toBe(1082 - (84 - 56));
  });

  it('is the fixed columns plus Name plus the phases, with nothing left out', () => {
    // Said as the equation rather than as a total, so a column added to the
    // width table without being rendered — or rendered without being summed —
    // shows up here as a disagreement rather than as a number nobody checks.
    // Proof: the role columns dropped from the sum, `grows by one folded column
    // per phase` failed on `expected 890 to be 1082`. Watched, 2026-08-09.
    expect(foldedTableMinWidth([], DATED)).toBe(
      frameLayout([...FIXED_COLUMNS, ...FLEXIBLE_COLUMNS], DATED).minWidth,
    );
    // Every column the table really renders is in that set, which is what the
    // equation above is only worth anything while it is true.
    for (const id of RENDERED) expect([...FIXED_COLUMNS, ...FLEXIBLE_COLUMNS]).toContain(id);
  });

  it('has no phases to be wide for at all, and still declares a table', () => {
    // A project may hold none — `R1`'s spec says the seeded pair is data rather
    // than a limit — and the dialog still has a number to print.
    expect(foldedTableMinWidth([], DATED)).toBe(890);
  });
});
