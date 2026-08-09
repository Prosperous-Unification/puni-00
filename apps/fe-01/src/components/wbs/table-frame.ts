import type { CSSProperties } from 'react';

import { POINTS } from './estimate-draft';

/**
 * Every fact about the plan a column's width is allowed to depend on, in one
 * object.
 *
 * One object rather than a widening argument list, and that is the whole of
 * why it exists: {@link frameLayout} has five consumers, and a second
 * parameter is a second thing each of them has to remember to pass. The second
 * fact arrived on 2026-08-09 as a field — `columnWidthOverrides` — and every
 * consumer that already built this object carried it without being edited.
 *
 * The first question is deliberately about the **project** rather than about
 * the rows on screen: a column that narrowed because the one row with a day on
 * it was collapsed away would change width under a reader who was only
 * scrolling.
 */
export interface FrameLayoutState {
  /** Whether any row in the project sets an earliest start. */
  hasAnyNotBefore: boolean;
  /**
   * The widths this browser was told by a drag, by the column's **own** id —
   * `<roleId>-final` for a folded phase — or absent where nothing has been
   * dragged.
   *
   * A fact about the reader rather than about the plan, which is why it is
   * here rather than a second parameter: every consumer of {@link frameLayout}
   * already carries this object, so a resized column reaches the `<col>`, the
   * table minimum, the folded minimum and the pinned offsets together or not
   * at all.
   *
   * Read by {@link widthFor} and by nothing else. It is **not** clamped on the
   * way through: a width outside the range a drag can produce is refused where
   * it is read out of storage (`rememberedWidthOverrides` in `wbs-table.tsx`),
   * and clamping here as well would make that refusal a check that cannot
   * fail.
   */
  columnWidthOverrides?: Map<string, number>;
}

/**
 * One column of a resolved frame, with the width it declares — or none, where
 * the layout decides it.
 */
export interface ResolvedColumn {
  id: string;
  /** px, or `undefined` for a {@link FLEXIBLE_COLUMNS} member. */
  width: number | undefined;
}

/**
 * Where one pinned column sits, and how wide it is held — or `undefined` where
 * the `<colgroup>` decides that.
 */
export interface PinnedGeometry {
  left: number;
  width: number | undefined;
}

/**
 * Every width one render of the table declares, resolved together.
 *
 * The object that replaced five consumers each doing their own arithmetic: the
 * `<colgroup>`, the table's own `min-width`, the folded minimum the Phases
 * dialog quotes, the offsets the pinned columns are held at, and the browser
 * gate's equation. A width that changes changes all five, because there is
 * only one of them.
 */
export interface FrameLayout {
  /** The leaf columns handed in, in that order, each with the width it declares. */
  columns: readonly ResolvedColumn[];
  /** The narrowest the whole table may be laid out, in px. */
  minWidth: number;
  /** The {@link PINNED_COLUMN_IDS} that are on screen in this state, and where they are held. */
  pinned: ReadonlyMap<string, PinnedGeometry>;
}

/**
 * Every column whose width is the same on every plan, by fixed id, in px.
 *
 * The constants half of the width table. The other half is
 * {@link PLAN_WIDTHS}, and the two are read together by {@link widthFor}; the
 * split is what this change is for — until 2026-08-09 there was no second half
 * and a width could not depend on the plan at all.
 *
 * These numbers are the compaction Dany asked for on 2026-08-08 ("compact
 * every column as far as it will go"), and every one of them is a figure the
 * browser gate measures rather than a preference: the table has to fit a
 * 1280px laptop with two roles folded. `name` is deliberately absent — see
 * {@link FLEXIBLE_COLUMNS}.
 *
 * A `Map` rather than a plain object because the id being looked up is a
 * column id from the table model, not a key known here: a `Record<string,
 * number>` would type every miss as a `number` and the check below as dead
 * code, which is precisely the check that must not be dead.
 */
const COLUMN_WIDTHS = new Map<string, number>([
  // The handle and nothing else. 28 was room for a handle and a hover target;
  // the glyph is the hover target.
  ['drag', 24],
  // {@link NUMBER_ENVELOPE} says what this number is sized to hold, and
  // `e2e/layout.spec.ts`'s `the Number column fits its envelope` is the
  // browser that picked it. It is not a guess at the longest number — there is
  // no longest number.
  //
  // It went **up**, 100 → 169, which was the surprise of `T2
  // compact-columns`: at the deepest indent Chromium measures 48px of indent,
  // a 12.5px expander, a 20px lock and 80px of eleven-character number, plus
  // the cell's 8px of padding. The column had been clipping its own envelope
  // since the 168 → 100 compaction, and nothing measured it until now.
  ['number', 169],
  ['depends', 110],
  ['team', 120],
  ['final-total', 52],
  ['start', 52],
  ['finish', 52],
  ['float', 56],
  // No `notes`: a work item's notes are typed under its name, in the Name
  // cell, and the column they had of their own is gone. 260px of a table that
  // has to lose about 500 to stop scrolling sideways at 1280.
  // One ⋯ button, not a pair of labelled ones: 110 was the width Duplicate and
  // Delete needed side by side, and the menu they moved into hangs off this
  // cell rather than living in it.
  ['actions', 40],
]);

/**
 * The earliest-start column's width where at least one row in the project sets
 * a day, in px.
 *
 * A short date and nothing else — `1 Jun`, or `1 Jun 2027` off the current
 * year. It was 146 until 2026-08-09 because it held a native date input at
 * rest on every row, and an unconstrained `input[type=date]` asks Chromium for
 * 138px. The editor is mounted for the cell being edited now, and it escapes
 * the cell rather than sizing it — see {@link DATE_EDITOR_WIDTH}.
 */
const NOT_BEFORE_WITH_DAYS = 84;

/**
 * The earliest-start column's width where no row in the project sets a day, in
 * px — an em-dash on every row, and a heading that abbreviates.
 */
const NOT_BEFORE_EMPTY = 56;

/**
 * How wide the date editor is laid out while it is open, in px.
 *
 * The one number in this file the repository does not get to choose: it is
 * what Chromium lays an unconstrained `input[type=date]` out at in the table's
 * font — the separators, the spinner and the picker icon — measured rather
 * than argued with. `e2e/layout.spec.ts`'s `the editor is never narrower than
 * this browser's own unconstrained field` is the assertion it moves with.
 *
 * Wider than the column it opens in, deliberately. A column that grew while
 * somebody was typing would move every cell under them, so the editor leaves
 * the cell instead — through the same clip exemption the dependency listbox and
 * the notes preview use (`opensAPopover` in `wbs-table.tsx`).
 */
export const DATE_EDITOR_WIDTH = 138;

/**
 * Every column whose width is a fact about the plan, by fixed id.
 *
 * A function of {@link FrameLayoutState} rather than a number, so what a width
 * may depend on is stated in one place and read in one place. The
 * earliest-start column is the only one of them; the reader's own overrides are
 * the other half of the same state, and they outrank whatever this resolves —
 * see {@link widthFor}.
 */
const PLAN_WIDTHS = new Map<string, (state: FrameLayoutState) => number>([
  ['not-before', (state) => (state.hasAnyNotBefore ? NOT_BEFORE_WITH_DAYS : NOT_BEFORE_EMPTY)],
]);

/**
 * Every fixed column this table renders, whatever the plan — the two halves of
 * the width table together.
 *
 * Enumerated from the maps rather than written out a second time: the folded
 * minimum the Phases dialog quotes is "every fixed column, plus Name, plus one
 * folded column per phase", and a column added to either map but missing here
 * would be a number describing a narrower table than the one on screen.
 */
export const FIXED_COLUMNS: readonly string[] = [...COLUMN_WIDTHS.keys(), ...PLAN_WIDTHS.keys()];

/**
 * The columns with no declared width, which take what the fixed ones leave.
 *
 * A table that fits the window is a table with one column that is not a
 * number: everything else is a figure, a date or a control of a known size,
 * and the name is the sentence that should have the rest. So the `<colgroup>`
 * emits no `<col width>` for these and `table-layout: fixed` divides the
 * remainder among them.
 *
 * A set, not a sentinel width. {@link widthFor} keeps throwing on anything it
 * has no number for, because a flexible column and an unsized one look
 * identical to a caller that gets a plausible number back — and the caller
 * that must not get one is the pinned-offset arithmetic. Membership here is
 * the question to ask instead.
 */
export const FLEXIBLE_COLUMNS: ReadonlySet<string> = new Set(['name']);

/**
 * The narrowest a flexible column is allowed to become, in px.
 *
 * It is what {@link frameLayout} budgets for the Name column, and it is on the
 * cell as well: below this the table stops shrinking and the frame scrolls
 * instead, with the pinned columns holding the left edge. 200px is about
 * twenty-five characters of the page's font — a phrase rather than a word.
 */
export const FLEXIBLE_FLOOR = 200;

/**
 * The widths of a role's columns, which have no fixed ids: a role is created at
 * runtime and its columns are named `<roleId>-final`, `<roleId>-<point>` and
 * `<roleId>-assignee`. Sized by suffix, because the role half of the id is
 * whatever the project called it.
 *
 * The folded column is the one that grew: it shows the figure *and* who is
 * doing the work (`4.8 · Kat`) since the assignee stopped folding away with
 * the trio. The three point boxes hold a number of days and are sized for one.
 */
const ROLE_FINAL_WIDTH = 96;
const ROLE_POINT_WIDTH = 52;
const ROLE_ASSIGNEE_WIDTH = 120;

/** An id the width table has never heard of — a typo, or a new column nobody sized. */
export class UnknownColumnError extends Error {
  constructor(columnId: string) {
    super(
      `No declared width for column "${columnId}". Every rendered column ` +
        `must be in COLUMN_WIDTHS or PLAN_WIDTHS or use a role suffix — an unlisted ` +
        `one would silently get a wrong width, which is the overlap bug all over again.`,
    );
    this.name = 'UnknownColumnError';
  }
}

/**
 * How wide the column with this id is laid out for this plan **before** the
 * reader has said otherwise, in px.
 *
 * The width table's own answer, which is what a {@link Width reset} returns a
 * column to and what {@link floorFor} takes the narrower of. Everything that
 * lays the table out wants {@link widthFor} instead — this one cannot see an
 * override, which is exactly why the reset can be "the width resolved now"
 * rather than a snapshot.
 *
 * @throws {UnknownColumnError} when nothing declares a width for that id, a
 * {@link FLEXIBLE_COLUMNS} member included. See {@link widthFor}.
 */
export function defaultWidthFor(columnId: string, state: FrameLayoutState): number {
  const declared = COLUMN_WIDTHS.get(columnId);
  if (declared !== undefined) return declared;
  const fromPlan = PLAN_WIDTHS.get(columnId);
  if (fromPlan !== undefined) return fromPlan(state);
  if (columnId.includes('-')) {
    if (columnId.endsWith('-final')) return ROLE_FINAL_WIDTH;
    if (columnId.endsWith('-assignee')) return ROLE_ASSIGNEE_WIDTH;
    const point = columnId.slice(columnId.lastIndexOf('-') + 1);
    if ((POINTS as readonly string[]).includes(point)) return ROLE_POINT_WIDTH;
  }
  throw new UnknownColumnError(columnId);
}

/**
 * How wide the column with this id is laid out for this plan and this reader,
 * in px — the override where there is one, and the width table's own answer
 * where there is not.
 *
 * Never ask it about a {@link FLEXIBLE_COLUMNS} member: those have no declared
 * width by design and this throws for them exactly as it does for a typo. That
 * is the point — a sentinel would let the pinned-offset arithmetic add a
 * number the browser never uses. The default is resolved **first**, so an
 * override naming the flexible column throws rather than sizing it.
 *
 * The override is taken as it stands rather than clamped; see
 * {@link FrameLayoutState.columnWidthOverrides} for why that matters.
 *
 * Prefer {@link frameLayout}: this answers about one column, and every consumer
 * in the app needs the whole frame resolved together.
 *
 * @throws {UnknownColumnError} when nothing declares a width for that id.
 * Unknown is not OK here: a column that fell through to a default would be laid
 * out at one width while the pinned offsets were summed from another, and the
 * two disagreeing is exactly the overlap this module exists to make impossible.
 */
export function widthFor(columnId: string, state: FrameLayoutState): number {
  const resolved = defaultWidthFor(columnId, state);
  return state.columnWidthOverrides?.get(columnId) ?? resolved;
}

/**
 * The widest any column may be laid out, in px, whether it got there by a drag
 * or out of storage.
 *
 * **One constant read by both**, and that is the whole of why it is exported:
 * a drag that could produce a width the stored-width check would refuse is a
 * column that silently returns to its default on the next reload, and the two
 * numbers would have to be kept in step by hand forever.
 *
 * 600 is three times {@link FLEXIBLE_FLOOR} and most of a 900px window. It
 * bounds a gesture that got away — a pointer that kept going after the reader
 * stopped looking — without bounding a real preference: the widest column the
 * table declares today is 169px, so a reader who wants three times that still
 * has it.
 */
export const WIDEST_COLUMN = 600;

/**
 * The narrowest any column may be dragged, in px, before its own default is
 * taken into account.
 *
 * A cell that can still be aimed at with a pointer. Columns whose default is
 * already narrower than this — the drag handle's 24px — stop at their default
 * instead; see {@link floorFor}.
 */
const NARROWEST_COLUMN = 36;

/**
 * The narrowest this column may be dragged, in px.
 *
 * The narrower of {@link NARROWEST_COLUMN} and the column's own resolved
 * default, because a floor above a column's default would make the first touch
 * of its handle widen it. Read from the **default** rather than from the width
 * in force: a floor that moved with the override would let a column be walked
 * down one drag at a time.
 *
 * @throws {UnknownColumnError} through {@link defaultWidthFor}, for a flexible
 * column as much as for a typo — a flexible column has no width to have a
 * floor under.
 */
export function floorFor(columnId: string, state: FrameLayoutState): number {
  return Math.min(defaultWidthFor(columnId, state), NARROWEST_COLUMN);
}

/**
 * `width` brought inside the range this column may be laid out at, in px.
 *
 * What a drag writes, and the shape the stored-width check accepts: the check
 * reads {@link floorFor} and {@link WIDEST_COLUMN} rather than repeating the
 * arithmetic, so no drag can produce a width a reload would reject.
 *
 * @throws {UnknownColumnError} through {@link floorFor}.
 */
export function clampColumnWidth(columnId: string, width: number, state: FrameLayoutState): number {
  return Math.min(Math.max(width, floorFor(columnId, state)), WIDEST_COLUMN);
}

/**
 * Whether this id names a column the frame layout can put a width on at all.
 *
 * The question a width read out of storage is asked first: an id nothing sizes
 * would throw out of the render that laid it out, and a preference about a
 * column that does not exist must not be able to take the table down.
 *
 * A role's column for a phase the project no longer holds answers `true` and
 * is then never looked at — the harmlessness a remembered expansion's deleted
 * row ids already have.
 */
export function sizableColumn(columnId: string, state: FrameLayoutState): boolean {
  try {
    defaultWidthFor(columnId, state);
    return true;
  } catch (error) {
    // The one modeled condition this function exists to answer about, caught
    // to answer it and nothing else: anything else thrown out of the width
    // table is a fault and goes on up.
    if (error instanceof UnknownColumnError) return false;
    throw error;
  }
}

/**
 * The columns held at the left edge while the table is scrolled sideways, in
 * order from that edge.
 *
 * Contiguity from the edge is not a preference: `position: sticky; left` pins a
 * cell at a fixed offset, so a pinned column with an unpinned one in front of it
 * would hang over whatever scrolled through the gap. That is why "Depends on"
 * sits to the right of Name rather than between it and Number —
 * `openspec/changes/sticky-table-frame/proposal.md` has the reversal written
 * down.
 *
 * Ids and no widths since 2026-08-09: a width is a fact about the plan being
 * drawn, so the offsets are resolved per render by {@link frameLayout} from the
 * same numbers that render's `<colgroup>` declares. Two lists of widths is one
 * list too many, and a list frozen at module load is worse — it cannot see the
 * plan at all.
 *
 * Name being last is load-bearing: it is flexible, so no offset is ever a sum
 * that includes it. {@link frameLayout} throws rather than assumes that.
 */
export const PINNED_COLUMN_IDS: readonly string[] = ['drag', 'number', 'name'];

/**
 * Every width one render declares, resolved from the columns on screen and the
 * plan being drawn.
 *
 * One call per render, read by the `<colgroup>`, the table's `min-width`, the
 * pinned cells and the Phases dialog alike. Before this existed the same
 * arithmetic lived in five places and the pinned offsets were prefix sums
 * computed **once when the module loaded** — which is why no width could depend
 * on the plan, and why `not-before` could not be two widths.
 *
 * `leafIds` is the columns being laid out, in the order they are laid out.
 * `state` is every fact a width may depend on; see {@link FrameLayoutState}.
 *
 * @throws {UnknownColumnError} for a leaf id nothing sizes. A column that fell
 * through to a default would be laid out at one width while the offsets in
 * front of it were summed from another.
 * @throws {Error} when a pinned column sits behind a flexible one. A sticky
 * offset is the sum of the widths in front of it and a flexible column has none
 * to add, so the sum would be right at exactly one window size.
 */
export function frameLayout(leafIds: readonly string[], state: FrameLayoutState): FrameLayout {
  const columns: ResolvedColumn[] = leafIds.map((id) => ({
    id,
    width: FLEXIBLE_COLUMNS.has(id) ? undefined : widthFor(id, state),
  }));
  return {
    columns,
    minWidth: columns.reduce((total, column) => total + (column.width ?? FLEXIBLE_FLOOR), 0),
    pinned: pinnedGeometryFor(columns, PINNED_COLUMN_IDS),
  };
}

/**
 * Where each of `pinnedIds` is held, given the widths one resolution declared.
 *
 * Exported for one reason, stated so it is not mistaken for an API: the order
 * of the pinned columns is a module constant, so the refusal below could
 * otherwise never be watched failing — there is no way to declare a fourth
 * pinned column from a test. {@link frameLayout} calls exactly this, with
 * {@link PINNED_COLUMN_IDS}; nothing in the app calls it directly.
 *
 * @throws {Error} when a pinned column sits behind a flexible one.
 */
export function pinnedGeometryFor(
  columns: readonly ResolvedColumn[],
  pinnedIds: readonly string[],
): ReadonlyMap<string, PinnedGeometry> {
  const pinned = new Map<string, PinnedGeometry>();
  let left = 0;
  /** The flexible pinned column already passed, which is what lets the refusal name both of them. */
  let flexibleBefore: string | null = null;
  for (const id of pinnedIds) {
    const resolved = columns.find((column) => column.id === id);
    // A pinned column this call is not laying out is simply not pinned in it.
    // Nothing in the app takes one away; `foldedTableMinWidth` resolves the
    // fixed set in its own order and the tests resolve partial lists, and a
    // throw here would make asking about either impossible.
    if (resolved === undefined) continue;
    if (flexibleBefore !== null) {
      // Unknown is not OK, and this is the shape of the unknown: a flexible
      // column's width is whatever the frame leaves over, so every column
      // pinned after one would be held at an offset that is right at exactly
      // one window size. Name is last today; this is what stops a fourth
      // pinned column being added behind it in silence.
      //
      // Proof: this branch deleted, `refuses a column pinned behind a flexible
      // one` failed on `expected [Function] to throw an error` — `depends`
      // declared as a fourth pinned column resolved to `{ left: 193, width:
      // 110 }`, a plausible offset with Name's missing width counted as
      // nothing. Watched, 2026-08-09.
      throw new Error(
        `${flexibleBefore} has no declared width, so ${id} cannot be pinned after it — ` +
          `a sticky offset is a sum of the widths in front of it and a flexible column has none.`,
      );
    }
    pinned.set(id, { left, width: resolved.width });
    if (resolved.width === undefined) flexibleBefore = id;
    else left += resolved.width;
  }
  return pinned;
}

/**
 * The narrowest the table can be laid out with these phases, all folded, in px
 * — the number the Phases dialog quotes before somebody adds another one.
 *
 * The phases' **real** ids, not a count. Every width resolves per column id, so
 * a figure summed from stand-in ids would answer about columns that do not
 * exist while the table lays out the ones that do: an override is stored under
 * the exact column id and a `phase0-final` could never carry one.
 *
 * Every column in {@link FIXED_COLUMNS} is on screen in every state of this
 * table — the drag handle, the number, Depends on, the team, the total, the
 * not-before date, Start, Finish, Slack and the ⋯ menu, none of them
 * conditional — so the folded floor is that set, plus Name's
 * {@link FLEXIBLE_FLOOR}, plus one folded column per phase.
 *
 * Derived through {@link frameLayout} rather than as arithmetic of its own,
 * and that is the whole point of it living here rather than as a sentence in
 * the dialog: a column that changes width changes this number in the same
 * commit. `phases-dialog.test.tsx` pins the quoted figure against what a real
 * `WbsTable` render of the same phases declares as its `min-width`.
 *
 * @throws {UnknownColumnError} through {@link frameLayout}, for the same
 * reason it does.
 */
export function foldedTableMinWidth(roleIds: readonly string[], state: FrameLayoutState): number {
  return frameLayout(
    [
      ...FIXED_COLUMNS,
      ...FLEXIBLE_COLUMNS,
      // The folded column of each phase, named exactly as the table names it.
      ...roleIds.map((roleId) => `${roleId}-final`),
    ],
    state,
  ).minWidth;
}

/** How many levels the Number column indents a row before it stops. */
export const DEEPEST_INDENT = 4;

const INDENT_STEP = 12;

/**
 * The Number cell's indent for a row `depth` levels down, in px.
 *
 * The cap is what keeps the pinned columns from overlapping. Number is held to a
 * declared width, and an indent that kept growing would push the number itself
 * past that width — where Name, pinned at the sum of the widths in front of it,
 * would paint straight over it once the table is scrolled sideways. Past
 * {@link DEEPEST_INDENT} levels a row stops moving right; the number printed in
 * the cell still says how deep it is.
 *
 * The step is 12px rather than 16: four levels take 48px of the column and the
 * number itself keeps the larger half. A step of 16 would spend 64px of the
 * column on white space and take {@link NUMBER_ENVELOPE} — and so the column —
 * wider again.
 */
export const indentFor = (depth: number): number => Math.min(depth, DEEPEST_INDENT) * INDENT_STEP;

/**
 * The widest number the Number column undertakes to show whole, as the string a
 * browser measures.
 *
 * **There is no longest work item number**, which is why this is an envelope
 * rather than a maximum. be-01's `deriveNumbers` widens a sibling label with
 * the size of its group, adds a dotted segment for every level of depth, and
 * appends a digit each time a work item is inserted against a frozen anchor
 * that leaves no natural label free — and that last one has no bound at all. A
 * column sized to the longest number on the plan would move every row in the
 * table the moment one deep row was inserted.
 *
 * So the column undertakes eleven characters: a root label's agreed three, plus
 * one dotted single-character segment for each level down to
 * {@link DEEPEST_INDENT}. Drawn at that indent, beside the expander and the
 * frozen-number lock, that is what `e2e/layout.spec.ts`'s `the Number column
 * fits its envelope` measures — and `COLUMN_WIDTHS`'s figure is asserted
 * against the measurement rather than read off the markup.
 *
 * Anything longer is clipped with the whole number in the cell's `title`: the
 * same bargain the short dates make.
 */
export const NUMBER_ENVELOPE = `010${'.1'.repeat(DEEPEST_INDENT)}`;

/**
 * The colour a sticky cell paints itself, as the slot rather than the shade.
 *
 * `--cell-bg` is set per row by `styles.css` — banded, hovered, a drop target —
 * and read here, which is the only way those states can reach a pinned cell at
 * all: this declaration is an *inline* style and an inline style outranks every
 * layer, so a `tr:hover` rule could never repaint one from the outside.
 *
 * The fallback is load-bearing rather than tidy. An undefined custom property
 * makes `background` invalid at computed-value time, and an invalid background
 * is `transparent` — which is the row scrolling straight through the pinned
 * block again, silently. Naming the opaque default here means deleting the
 * stylesheet's grid layer costs the banding and nothing else.
 */
const HEADER_BACKGROUND = 'var(--cell-bg, var(--muted))';
const ROW_BACKGROUND = 'var(--cell-bg, var(--background))';

/**
 * Which sticky cell paints over which. A pinned header cell is sticky on both
 * axes and crosses every other one, so it is on top; the header row crosses the
 * body; a pinned body cell only crosses the cells scrolling behind it.
 *
 * The pickers inside the cells sit at `z-index: 10` and above, deliberately
 * higher than all of these: an open list has to be readable over a pinned
 * column, and it closes the moment the person is done with it.
 *
 * {@link POPOVER_ROW_LAYER} is the fourth, and it exists because a browser
 * found the reason. A pinned cell is `position: sticky` **with a z-index**,
 * which makes it a stacking context — so a popover inside one is trapped in
 * it, however high its own z-index, and the *next* row's pinned cell paints
 * straight over it. The Name column is the only cell in this table that is
 * both pinned and holds a popover, and the notes preview hanging off it was
 * invisible under the row below until this layer existed. Observed on h2puni,
 * 2026-08-08: `4px below the name cell is <textarea> in the name column, not
 * the preview`.
 *
 * It sits above the other body cells and below both header layers, which is
 * the whole of what it has to do: the preview opens downwards, over the rows,
 * and the heading stays a heading.
 */
const PINNED_BODY_LAYER = 1;
export const POPOVER_ROW_LAYER = 2;
const HEADER_LAYER = 3;
const PINNED_HEADER_LAYER = 4;

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
 * the notes preview, a picker's list, the date editor — sits in a
 * `position: relative` wrapper span that is **inside** the `<td>`, so the
 * `<td>`'s own clip cuts it to the cell rectangle no matter how the wrapper is
 * styled. The columns carrying those popovers therefore spread this and then
 * override `overflow` to `visible`; the exception, which columns it covers, and
 * what still contains those cells are written out at `opensAPopover` in
 * `wbs-table.tsx`.
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
 * What one cell carries because its column is pinned in this layout, or nothing
 * when it is not.
 *
 * The layout is passed in rather than read from a module-level map, which is
 * the change that made a width able to depend on the plan: the offset a cell is
 * held at is a sum of the widths the *same* resolution declared for the columns
 * in front of it.
 *
 * The background is not decoration. A sticky cell keeps its place while the rest
 * of its row scrolls behind it, and a transparent one shows that row straight
 * through itself — two sets of numbers on top of each other and no way to tell
 * which is which. `box-sizing` is the same kind of load-bearing: the declared
 * width has to include the cell's own padding, or every column is a couple of
 * pixels wider than the offset computed from it and the pinned edge drifts.
 */
export function pinnedCellStyle(
  layout: FrameLayout,
  columnId: string,
  part: 'header' | 'body',
): CSSProperties | undefined {
  const pinned = layout.pinned.get(columnId);
  if (pinned === undefined) return undefined;
  return {
    position: 'sticky',
    left: pinned.left,
    // Only where there is one to declare. A flexible column's width is the
    // `<colgroup>`'s to decide and a fixed `width` here would be a second
    // opinion about it — the two-width-systems bug, one column along.
    ...(pinned.width === undefined ? {} : { width: pinned.width }),
    boxSizing: 'border-box',
    background: part === 'header' ? HEADER_BACKGROUND : ROW_BACKGROUND,
    zIndex: part === 'header' ? PINNED_HEADER_LAYER : PINNED_BODY_LAYER,
  };
}

/**
 * What one cell carries because its column is flexible, or nothing when it is
 * not.
 *
 * The floor, on the cell as well as in {@link frameLayout}. The table's own
 * `min-width` is what really holds it — under `table-layout: fixed` a cell does
 * not get a vote on its column's width — and this is the belt that says so
 * where a reader of the markup is looking, and that keeps the cell honest if
 * the table is ever laid out any other way.
 */
export function flexibleCellStyle(columnId: string): CSSProperties | undefined {
  return FLEXIBLE_COLUMNS.has(columnId) ? { minWidth: FLEXIBLE_FLOOR } : undefined;
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
 * **It takes the remainder of the window, and it is told so rather than sent
 * to guess.** Until `H header-fits-a-row` the height was `calc(100vh - 16rem)`,
 * and the `16rem` was a guess at the chrome above: the page padding, the
 * heading, the signed-in line, the project picker and this toolbar. A guess is
 * wrong in both directions and it was wrong in both — the page scrolled
 * vertically at 1280×800 with the frame stopping 112px short of the window, and
 * a wider toolbar would have gone the other way. The whole chrome is now one
 * bar, and the layout says what it costs instead of this file estimating it:
 * `flex: 1 1 0%` gives this element every pixel its parent has left over.
 *
 * That works only while the whole chain is a column flex whose top is fixed to
 * the viewport — `app.tsx`'s `h-full` wrapper against the `html`/`body`/`#root`
 * height chain in `styles.css`, `ProjectPage`'s `<main>`, `WbsTable`'s
 * `<section>`, each `flex-1` with `min-h-0`. Break any link and
 * this basis has nothing to be a fraction of: the item falls back to its
 * content height and the frame stops being the thing that scrolls. The
 * declaration is asserted in `table-frame.test.ts` and the effect — the frame
 * ending at the bottom of the window, and the height it wins — in
 * `e2e/header.spec.ts`, because only a browser can tell those two apart.
 *
 * `minHeight` is still the floor, and a window too short for it still leaves the
 * page scrolling; that is the honest fallback rather than rows below a fold
 * nothing can reach.
 *
 * The bottom padding is room for the pickers to open into. They are absolutely
 * positioned inside their cells at `top: 100%` and up to 200px tall, and a
 * scroll container clips to its padding box — without the padding a picker on
 * the last row would need the frame scrolled before it could be read. The notes
 * preview is taller than this (320px) and still can.
 */
export const TABLE_FRAME: CSSProperties = {
  overflow: 'auto',
  flex: '1 1 0%',
  minHeight: '20rem',
  paddingBottom: '13rem',
};
