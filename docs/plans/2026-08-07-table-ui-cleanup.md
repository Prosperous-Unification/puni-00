# Table UI cleanup — implementation plan v2 (2026-08-07)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

v1 was reviewed by codex (`tmp/review-codex-ui-plan.txt`) and agy
(`tmp/review-agy-ui-plan.txt`) on 2026-08-07. Every critical and real finding is
folded in below; the per-finding disposition table is at the bottom.

**Goal:** Cells stop painting over each other, Tab moves between fields
predictably from every cell, and a real browser watches both so this cannot
regress unseen.

**Architecture:** One table of declared column widths becomes the single source
of truth for _both_ the sticky-pin offsets and the browser's actual layout:
`table-layout: fixed` with a `<colgroup>` generated from that table, every
in-cell control constrained to its cell (width, wrapping, and overflow — fixed
layout alone does not clip overflowing descendants). Tab handling extends from
the Name cell to every grid cell; **the Name cell keeps Tab-at-caret-0 indent**
(the Enter→Tab outliner workflow is load-bearing and explicitly tested). A
minimal Playwright job gives the repo eyes.

**Tech Stack:** React 19, TanStack Table (flat leaf columns — no groups), inline
styles (no CSS framework), Vitest + Testing Library (jsdom), Bun, Nx. One new
dev-dependency: `@playwright/test`.

## Why the elements overlap (root cause, confirmed by both reviewers)

`table-frame.ts` declares pinned widths (`drag` 28, `number` 168, `name` 360)
and computes each pinned column's `sticky left` as the prefix sum. The table is
**auto layout**: the browser sizes columns from content (the Number column grows
with indent depth), so `name`'s natural x can exceed its declared 196px sticky
offset — and a sticky cell with an opaque background then paints over `depends`.
Independently, inputs carry their own widths in em (`22em` name, `18em` notes,
`6em`/`4.5em` estimates, `size={14}` depends). Three width systems, no invariant.

Fix: make disagreement impossible (`table-layout: fixed` + `<colgroup>` from the
one width table, `width: 100%` inputs) **and** constrain the descendants fixed
layout does not clip: dependency chips (`whiteSpace: nowrap` wrapper,
`wbs-table.tsx` ~2166), `CreatablePicker`'s input+clear-button pair
(`creatable-picker.tsx` ~60/104), long role names in header buttons (~2366).

## Why Tab "does not work well" (confirmed in source)

1. Only the Name cell handles Tab (~line 1320); every other cell falls to
   browser tab order, which walks chip ✕ buttons, Duplicate/Delete, drag
   handles — Tab feels random everywhere except Name.
2. Even Name's Tab skips the depends/team/assignee pickers (`focusAdjacentCell`
   walks only `data-cell` inputs), while browser Tab includes them: two
   different orders for the same key.

**Product decision (changed from v1 after review):** Tab-at-caret-0 in Name
**keeps indenting**. Both reviewers showed removal breaks the tested
keyboard-only breakdown flow (Enter new row → Tab to make it a child,
`wbs-table.test.tsx:437`, plus ~8 more tests using it as setup) and that v1's
"Alt+Arrow works from any cell" claim is false (it is not attached to picker or
date inputs, ~1447). What changes: Tab from _any other_ cell, and Tab at any
non-zero caret or selection in Name, navigates to the adjacent cell. If Dany
wants Tab-indent gone too, that is a separate product change with its own test
migration — not smuggled in here.

## Global Constraints

- Bun everywhere, never npm; Nx targets (`bun nx run fe-01:test`).
- No builds on h1claw — implementation and Playwright runs on `h2puni` or CI.
- Non-vacuous checks (AGENTS.md): every new guard is seen to fail on the fault
  it guards; record proofs in the openspec change's `verify.md`.
- Ship as openspec change `table-geometry-and-tab-order`
  (proposal/tasks/verify), verified on dev like the roadmap changes.
- No redesign, no CSS framework. Header/label polish (shorter labels,
  right-aligned numerics, `critical` copy) is **out of scope** — both reviewers
  called it scope creep; it becomes its own later change if Dany wants it.
- Actual column ids (read from `wbs-table.tsx`, verified): `drag`, `number`,
  `name`, `depends`, `team`, `${role.id}-final`, `${role.id}-<point>`,
  `${role.id}-assignee`, `final-total`, `not-before`, `start`, `finish`,
  `float`, `notes`, `actions`. Point names come from `POINTS` — read
  `estimate-draft.ts` for the literal strings before writing tests.

---

### Task 1: One width table; fixed layout; every control contained

**Files:**

- Modify: `apps/fe-01/src/components/wbs/table-frame.ts`
- Modify: `apps/fe-01/src/components/wbs/table-frame.test.ts`
- Modify: `apps/fe-01/src/components/wbs/wbs-table.tsx` (table element ~3057,
  cells ~2080–2720)
- Modify: `apps/fe-01/src/components/wbs/creatable-picker.tsx` (container
  layout only)
- Modify: `apps/fe-01/src/components/wbs/wbs-table.test.tsx`

**Interfaces:**

- Produces: from `table-frame.ts` —
  `widthFor(columnId: string): number` (throws `UnknownColumnError` on an id it
  does not recognize), `tableWidth(columnIds: readonly string[]): number`,
  `CELL: CSSProperties` (shared td/th chrome), `PINNED_COLUMNS` derived from
  the same width table. Task 3 relies on `data-cell` staying the grid marker;
  Task 4 relies on the rendered `<colgroup>`.

- [ ] **Step 1: Failing tests** in `table-frame.test.ts`:

```ts
import {
  PINNED_COLUMNS,
  pinnedGeometry,
  widthFor,
  tableWidth,
  UnknownColumnError,
} from './table-frame';

test('every pinned offset is the prefix sum of the same width table', () => {
  let left = 0;
  for (const { id, width } of PINNED_COLUMNS) {
    expect(pinnedGeometry(id)).toEqual({ left, width });
    expect(width).toBe(widthFor(id));
    left += width;
  }
});

test('every column the table renders has a declared width', () => {
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
  expect(widthFor('r1-final')).toBeGreaterThan(0);
  expect(widthFor('r1-assignee')).toBeGreaterThan(0);
  // one per literal in POINTS — copy them from estimate-draft.ts
});

test('an id this table never renders is an error, not a plausible width', () => {
  expect(() => widthFor('serviec')).toThrow(UnknownColumnError);
});

test('tableWidth is the sum of its columns', () => {
  expect(tableWidth(['drag', 'number'])).toBe(widthFor('drag') + widthFor('number'));
});
```

- [ ] **Step 2: Run, watch fail** — `bun nx run fe-01:test -- table-frame`:
      `widthFor` not exported.

- [ ] **Step 3: Implement in `table-frame.ts`:**

```ts
/**
 * Every column the table can show, with the width `table-layout: fixed` holds
 * it to. THE single source of truth: the `<colgroup>` renders these numbers
 * and the pinned offsets are prefix sums of the same numbers, so the geometry
 * the offsets assume is the geometry the browser lays out. The overlap this
 * replaces came from three width systems (declared px, auto table layout,
 * em-sized inputs) with no invariant tying them together.
 */
const COLUMN_WIDTHS: Record<string, number> = {
  drag: 28,
  number: 168,
  name: 360,
  depends: 220,
  team: 160,
  'final-total': 70,
  'not-before': 130,
  start: 70,
  finish: 70,
  float: 90,
  notes: 260,
  actions: 110,
};
const ROLE_FINAL_WIDTH = 110;
const ROLE_POINT_WIDTH = 76;
const ROLE_ASSIGNEE_WIDTH = 160;

/** An id the width table has never heard of — a typo or a new column nobody sized. */
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

export function widthFor(columnId: string): number {
  const declared = COLUMN_WIDTHS[columnId];
  if (declared !== undefined) return declared;
  if (columnId.includes('-')) {
    if (columnId.endsWith('-final')) return ROLE_FINAL_WIDTH;
    if (columnId.endsWith('-assignee')) return ROLE_ASSIGNEE_WIDTH;
    const point = columnId.slice(columnId.lastIndexOf('-') + 1);
    if ((POINTS as readonly string[]).includes(point)) return ROLE_POINT_WIDTH;
  }
  throw new UnknownColumnError(columnId);
}

export function tableWidth(columnIds: readonly string[]): number {
  return columnIds.reduce((total, id) => total + widthFor(id), 0);
}

export const PINNED_COLUMNS = (['drag', 'number', 'name'] as const).map((id) => ({
  id,
  width: widthFor(id),
}));

/** What every cell carries so declared width includes the chrome. */
export const CELL: CSSProperties = {
  boxSizing: 'border-box',
  padding: '1px 4px',
  verticalAlign: 'top',
  overflow: 'hidden',
};
```

(`POINTS` imports from `estimate-draft.ts` — same import `wbs-table.tsx`
already uses. `overflow: hidden` on the cell is the backstop that makes
"paints into the neighbour" structurally impossible even for a descendant
this plan missed; anything that _needs_ to escape the cell — the dep
listbox, the notes preview — is `position: absolute` in a `relative`
wrapper, and absolutely-positioned children are not clipped by an ancestor's
`overflow: hidden` unless the _positioned_ ancestor has it. The `relative`
wrapper spans do not, so the popovers survive. Verify this against both
popovers in Step 6.)

- [ ] **Step 4: Render the colgroup, fix the layout, share the cell chrome**
      in `wbs-table.tsx`:

```tsx
const leafIds = table.getVisibleLeafColumns().map((c) => c.id);
…
<table ref={tableElement}
  style={{ borderCollapse: 'separate', borderSpacing: 0,
           tableLayout: 'fixed', width: tableWidth(leafIds) }}>
  <colgroup>
    {leafIds.map((id) => <col key={id} style={{ width: widthFor(id) }} />)}
  </colgroup>
```

Spread `CELL` into every `<th>` (before `STICKY_HEADER_CELL`/pinned styles)
and every `<td>` (before `pinnedCellStyle`). The header render loop stays
leaf-per-th — the column model is flat, no `colSpan` handling needed (codex
#10 confirmed).

- [ ] **Step 5: Contain every control.** All in-cell controls follow their
      cell instead of asserting a width:
  - Name textarea: `22em` → `100%` (`boxSizing: 'border-box'`, keep
    `resize: 'vertical'`). Notes: `18em` → `100%`. Folded estimate: `6em` →
    `100%`, drop `size={7}`. Points: `4.5em` → `100%`, drop `size={5}`.
  - Depends cell: wrapper span → `display: 'block', maxWidth: '100%'`; chips
    get `whiteSpace: 'normal'` on the wrapper (chips may wrap onto lines —
    reviewers' chip-overflow finding; uneven row height is acceptable, hidden
    content is not); input drops `size={14}`, gets `width: '100%'`.
  - `CreatablePicker`: the input+clear-button pair must fit one cell — root
    span `display: 'flex', maxWidth: '100%', minWidth: 0`; input
    `flex: 1, minWidth: 0, width: 'auto'`; clear button `flex: 'none'`.
  - Role header buttons: `maxWidth: '100%', overflow: 'hidden',
textOverflow: 'ellipsis', whiteSpace: 'nowrap'` with the full role name in
    `title` — a long role name must not widen or overflow its header.

- [ ] **Step 6: jsdom guards** in `wbs-table.test.tsx` (contracts, not pixels —
      and by _control_, not by grid membership, so the depends input is covered
      today, not after Task 3 — codex #8):

```tsx
test('the colgroup declares every rendered column, in order', () => {
  const cols = [...document.querySelectorAll('colgroup col')];
  const headerCells = [...document.querySelectorAll('thead tr th')];
  expect(cols.length).toBe(headerCells.length);
});

test('no in-cell control asserts its own width', () => {
  // every editable control in the first body row: name, depends input,
  // team picker input, folded estimate, dates, notes
  for (const el of document.querySelectorAll<HTMLElement>(
    'tbody input:not([type=checkbox]), tbody textarea',
  )) {
    expect(['100%', 'auto', '']).toContain(el.style.width);
    expect(el.getAttribute('size')).toBeNull();
  }
});
```

- [ ] **Step 7: Popover survival check** — existing dep-picker and
      notes-preview tests still pass (they render children the `overflow: hidden`
      cell must not clip); if either fails, the wrapper span, not the cell, is the
      thing to fix. Suite green: `bun nx run fe-01:test`.

- [ ] **Step 8: Commit** —
      `fix(fe-01): one width table drives colgroup, pin offsets, and cell containment`.

### Task 2: Tab navigates from every cell; Name keeps caret-0 indent

**Files:**

- Modify: `apps/fe-01/src/components/wbs/wbs-table.tsx` (`onKeyDown` ~1313,
  every cell's handlers, depends input ~2224, `not-before` cell ~2559)
- Modify: `apps/fe-01/src/components/wbs/creatable-picker.tsx` (new optional
  props: `data-cell` pass-through and `onTabKey` callback)
- Modify: `apps/fe-01/src/components/wbs/keyboard-bindings.ts` (Tab copy,
  ~47–73) and its `PROVEN_BY` map in
  `apps/fe-01/src/components/wbs/keyboard-cheat-sheet.test.tsx` (~43–96)
- Test: `apps/fe-01/src/components/wbs/wbs-table.test.tsx`

**Interfaces:**

- Consumes: `focusAdjacentCell`, `editableGrid`, `cellKey`, `isCellElement`.
- Produces: every editable control carries `data-cell="rowId::columnId"`
  (Task 3's tab-walk test relies on it). `CreatablePicker` gains
  `gridCell?: { dataCell: string; onTabKey: (e: React.KeyboardEvent) => void }`.

- [ ] **Step 1: Failing tests** (in `wbs-table.test.tsx`, alongside the
      existing keyboard tests — which stay untouched: Enter→Tab breakdown at ~437,
      Shift+Tab outdent at ~468, and the ~8 tests using Tab-indent as setup are
      behaviour this plan preserves):

```tsx
test('Tab moves from an estimate cell to the next editable cell', …);
test('Tab in the middle of a name navigates; at caret 0 it still indents', …);
test('Tab from the depends input closes the picker, discards the typed search, and moves once', …);
test('Shift+Tab from the depends input lands in the name, not on a chip button', …);
```

- [ ] **Step 2: One shared handler:**

```tsx
const onTabKey = useCallback((event: React.KeyboardEvent, rowId: string, columnId: string) => {
  if (event.key !== 'Tab') return;
  const input = event.currentTarget;
  if (!isCellElement(input)) return;
  const moved = focusAdjacentCell(input, { rowId, columnId }, event.shiftKey ? -1 : 1);
  if (moved) event.preventDefault();
}, []);
```

Name's `onKeyDown` keeps its Tab branch exactly as-is (caret-0 → indent,
else `focusAdjacentCell`) — it already is the shared behaviour plus the
outliner special case. Every other cell adds `onTabKey` to its handler
chain: folded estimate, points, notes, depends input, `not-before` date,
and both pickers via the new prop.

- [ ] **Step 3: Pickers join the grid explicitly** (a `data-cell` attribute
      alone wires nothing — codex #6):
  - Depends input: add `data-cell={cellKey(row.original.id, 'depends')}`; in
    its `onKeyDown`, before the existing Enter branch:
    `if (e.key === 'Tab') { onTabKey(e, row.original.id, 'depends'); return; }`
    — blur then closes the picker and discards the uncommitted search, which
    is today's blur contract, now exercised by Tab on purpose (typed text is
    a _search_, not a value; committing it on Tab would add dependencies
    nobody confirmed).
  - `CreatablePicker`: new `gridCell` prop; the input spreads
    `data-cell={gridCell?.dataCell}` and its internal `onKeyDown` handles Tab
    first: `if (e.key === 'Tab' && gridCell) { gridCell.onTabKey(e); return; }`.
    Enter/Escape/arrows stay picker-owned. Call sites: `team` and
    `${role.id}-assignee` cells.
  - `not-before` date input: add `data-cell`; Tab via `onTabKey`. Guard
    `focusAdjacentCell`/`onArrowKey`'s `.select()`: date inputs throw on
    `setSelectionRange` in some engines — wrap the select/caret calls:
    `if (next.input instanceof HTMLTextAreaElement || next.input.type === 'text') next.input.select(); else next.input.focus()`
    (agy nit; verify which engines object in the Task 3 browser run).
- [ ] **Step 4: Grid edges.** `focusAdjacentCell` returning false leaves the
      key to the browser; on the last cell of a row the _next_ focusable is that
      row's Duplicate/Delete (codex #7) — that is acceptable and now consistent
      (actions are reachable at the end of each row, never in the middle), and the
      cheat-sheet copy says so. No focus trap added.
- [ ] **Step 5: Truthful copy.** `keyboard-bindings.ts`: Tab/Shift+Tab rows
      become "Next / previous field — in the name, at the very start, Tab still
      indents (Shift+Tab outdents)". Update `PROVEN_BY` in
      `keyboard-cheat-sheet.test.tsx` to name the new tests (its 1:1
      binding↔proof check fails otherwise — agy finding).
- [ ] **Step 6: Suite green** — `bun nx run fe-01:test`. Commit —
      `feat(fe-01): Tab walks every cell; Name keeps the outliner caret-0 indent`.

### Task 3: Eyes — a Playwright layout gate in CI

The overlap shipped because nothing with a rendering engine ever saw the table.
Smallest honest harness: one spec, chromium only, real three-app stack.
Assertions are bounding-box math structured around the sticky design — a naive
adjacent-pair sweep after horizontal scroll would false-fail on correct paint,
because unpinned cells scrolling _behind_ opaque pinned cells is the intended
behaviour (both reviewers, critical).

**Files:**

- Create: `apps/fe-01/e2e/layout.spec.ts`, `apps/fe-01/playwright.config.ts`
- Modify: `.github/workflows/ci.yml` (new independent `pixels` job; `gate`
  untouched), root `package.json` (script `e2e`); wire an Nx target the way
  `apps/fe-01/project.json` declares its others — read it first.

**Interfaces:**

- Consumes: Task 1's colgroup; Task 2's `data-cell` on every editable control.
- Produces: CI job `pixels`; screenshot artifact per run (diagnostic, not the
  design loop — widths were already chosen in Step 0).

- [ ] **Step 0: Pick the widths with human eyes once.** Before writing
      assertions, run the stack on h2puni (`bun run dev:setup && bun run dev`),
      open dev in a headed/screenshotting chromium, and settle the
      `COLUMN_WIDTHS` numbers with Dany against a ~1400px viewport. Adjust the
      Task 1 constants in the same PR — CI then _enforces_ the decision instead
      of hosting an iterate-by-artifact loop (both reviewers).
- [ ] **Step 1: Config.** Port is **4200** (`apps/fe-01/vite.config.ts` —
      v1 had 5173, wrong). Readiness must cover all three apps, not just Vite
      (signup 502s otherwise): be-01 on :3100, gw-01 on :3200 — read their
      configs/health routes and wait on all three URLs; `webServer` accepts an
      array. DB isolation: point be-01 at a per-run temp file via env
      (read how `apps/be-01` names its sqlite path from `.env.example` /
      `MIGRATE_ON_STARTUP` and pass a fresh `tmp/e2e-<run>.db`); never reuse
      `local.db`, and set `reuseExistingServer: false` in CI so state is fresh.
- [ ] **Step 2: The spec.** Seed through the UI (sign up a unique throwaway
      user — suffix `Date.now()` — create a project, two rows with wrapping
      names, one dependency, one estimate). Then, unscrolled:
  - Adjacent leaf cells in `thead`'s single row and in each body row meet
    without overlap: `boxes[i].x + 0.5 >= boxes[i-1].x + boxes[i-1].width`.
  - Every editable control sits inside its owning `td`'s box (both edges).
  - The three pinned cells sit exactly at their declared lefts:
    `drag.x ≈ frame.x`, `number.x ≈ frame.x + 28`, `name.x ≈ frame.x + 196`.
    After `frame.scrollLeft = 400` (set via `evaluate`, deterministic —
    not `mouse.wheel`):
  - Pinned cells still sit at the declared lefts (that is the invariant that
    drifted in the bug).
  - The first _fully visible_ unpinned cell starts at or right of the pinned
    block's right edge: for each body row, every unpinned cell box either
    ends left of `pinnedRight + 0.5` minus nothing (scrolled behind — fine)
    or starts at `>= pinnedRight - 0.5`; what must never happen is a cell
    _partially_ straddling the boundary by more than the border tolerance
    while painting over it — assert via `document.elementFromPoint` just
    right of the boundary returning the unpinned cell's content, and just
    left of it returning the pinned cell's. No naive pair-sweep post-scroll.
  - Tab walk: focus the first name, send Tab through the row, assert the
    sequence of `document.activeElement`'s `data-cell` values equals DOM
    order of that row's `[data-cell]:not([readonly])` — allowing the
    caret-0 indent case by first typing a character into empty names.
  - `page.screenshot` to `test-results/wbs-table.png`, uploaded always.
- [ ] **Step 3: Prove the gate non-vacuous:** reintroduce the fault class —
      set the name `<col>` to 100 while the textarea keeps a hard `22em` width —
      containment and adjacency must fail; revert; record in `verify.md`.
- [ ] **Step 4: CI job**, additive, bun version pinned to the same value as
      `gate` (copy the pin, don't float):

```yaml
pixels:
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
      with: { bun-version: <copy the gate pin> }
    - run: bun install --frozen-lockfile
    - run: bunx playwright install --with-deps chromium
    - run: bun run e2e
    - uses: actions/upload-artifact@v4
      if: always()
      with: { name: wbs-table-screenshot, path: apps/fe-01/test-results/ }
```

- [ ] **Step 5: Commit** — `ci(fe-01): playwright layout gate; the pixels are watched`.

---

## Deferred (own change, only if Dany asks)

- Header/label polish: shorter `Starts/Ends/Slack` labels, right-aligned
  numeric columns, `tabular-nums`, `critical` copy. (v1 Task 2 — both
  reviewers: scope creep, off the critical path.)
- Removing Tab-at-caret-0 indent in favour of Alt+Arrow only — product change,
  ~10 tests to migrate, needs Dany's explicit call.

## Review disposition (v1 → v2)

| Finding (reviewer)                                                                                | Disposition                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column ids wrong: `team`/`final-total`/`not-before`; silent 76px fallback (both, critical)        | Fixed: real ids; `widthFor` throws `UnknownColumnError`; negative test added                                                                                                           |
| Post-scroll adjacent-pair assertion false-fails on correct sticky paint (both, critical)          | Fixed: split into unscrolled adjacency, pinned-position invariant, containment, and an `elementFromPoint` occlusion-boundary check                                                     |
| Fixed layout doesn't clip descendants: chips, picker+clear button, role headers (codex, critical) | Fixed: Task 1 Step 5 contains each; `overflow: hidden` cell backstop; popover-survival check Step 7                                                                                    |
| Tab-indent removal breaks tested Enter→Tab outlining; Alt+Arrow claim false (both, real)          | Reversed: Name keeps caret-0 indent; removal deferred as explicit product decision                                                                                                     |
| Picker `data-cell` alone wires nothing; Tab-out semantics unspecified (codex, real)               | Fixed: `gridCell` prop with `onTabKey`; Tab discards the typed _search_ by design, tested                                                                                              |
| Tab out of picker = silent discard is data loss (agy, real)                                       | Rejected as a defect: typed text is a search filter, not a value; committing unconfirmed matches on Tab would create dependencies nobody chose. Kept today's blur contract, now tested |
| Cheat-sheet `PROVEN_BY` 1:1 check breaks (agy, real)                                              | Fixed: Task 2 Step 5 updates map + named tests                                                                                                                                         |
| jsdom width guard vacuous for depends until pickers join grid (codex, real)                       | Fixed: guard selects all tbody inputs/textareas, not `[data-cell]`                                                                                                                     |
| Playwright port 5173 wrong → 4200; readiness; DB isolation (both, real)                           | Fixed: Step 1                                                                                                                                                                          |
| Edge-of-grid Tab lands on Duplicate/Delete, contradicting "never receives focus" (codex, real)    | Accepted behaviour, restated: actions reachable at row end, never mid-row; E2E asserts mid-row only                                                                                    |
| `.select()` on date inputs (agy, nit)                                                             | Fixed: type-guarded select                                                                                                                                                             |
| Width tuning via CI screenshot loop = rework (both)                                               | Fixed: Step 0 picks widths once, locally, with Dany; unit tests assert relationships not literals                                                                                      |
| Header polish scope creep (both)                                                                  | Cut to Deferred                                                                                                                                                                        |
