<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Standing rule for this change

Every negative below is written and **watched failing** before the line it
guards is believed. `P phases-ui`'s sanitizer was written, its negative watched
_passing_ with the line deleted, and the line removed — the order is the whole
point. Each guard carries a `Proof:` comment naming the injected fault and the
test that observed it.

## 1. Overrides inside the resolved frame layout

- [ ] 1.1 `frameLayout(leafIds, state)` (T2's, already the single width
      product) keeps its two arguments and the overrides go **into the state**:
      `FrameLayoutState` becomes
      `{ hasAnyNotBefore: boolean; columnWidthOverrides?: Map<string, number> }`
      — that spelling is T2's tasks 1.1 and 1.3, and the two changes must read
      identically — so the `<col>` width, `tableMinWidth`,
      `foldedTableMinWidth` and each pinned column's `left` are all derived
      from the same resolved number — test: `table-frame.test.ts`, one override
      asserted through all four consumers in one case; negative: the
      pinned-offset arm re-pointed at the defaults instead of the resolved
      widths, so `a pinned column's left moves with the override` is watched
      failing — the agy-1 regression, and the reason the four are asserted
      together rather than one per test
- [ ] 1.1a The folded minimum is asked about real columns: T2 left
      `foldedTableMinWidth(roleIds, state)` taking the project's role ids, and
      an override is stored under the exact column id — so a `<roleId>-final`
      override reaches the Phases dialog's figure and a stand-in `phase0-final`
      id never could — test: `phases-dialog.test.tsx` overrides one role's
      folded column and asserts the quoted figure and a real render's
      `min-width` both carry it; negative: the dialog re-pointed at stand-in
      ids built from `roles.length` → the quote is watched failing at the
      default width while the table lays out the dragged one
- [ ] 1.2 `floorFor(columnId)` = `min(resolved default, 36)` and
      `WIDEST_COLUMN = 600` in `table-frame.ts` beside the widths themselves,
      exported and used by **both** the drag clamp and the stored-width check,
      so no drag can produce a width a reload would reject. Its JSDoc says
      where 600 comes from — three times `FLEXIBLE_FLOOR` and most of a 900px
      window, so it bounds a gesture that got away without bounding a real
      one — test: `table-frame.test.ts` clamp cases incl. the 24px drag column
      and a drag past 600 stopping at 600, plus one case asserting the stored-
      width check accepts exactly what the clamp can produce (the same
      constant, not two); negatives: the floor pinned to a flat 36, so
      `the drag column is not forced out to 36` is watched failing; and the
      stored-width check given a ceiling of its own at 500, so
      `a width dragged to the ceiling survives a reload` is watched failing
- [ ] 1.3 `floorFor` and the override lookup **throw** for a flexible column,
      as `widthFor` already does — a flexible column has no declared width to
      override and a plausible number handed back is the pinned-offset bug
      again — test: `table-frame.test.ts` throw case for `name`; negative: the
      throw replaced by `FLEXIBLE_FLOOR` → the case watched failing
- [ ] 1.4 Width state lives beside `expanded`, **not** in the `columns` memo:
      its dep array stays `[roles, unfoldedRoles]` — test:
      `wbs-table.test.tsx`, a half-typed name and its caret survive a width
      change; negative: the override state added to the dep array → the case
      watched failing on the remount that eats the value (landmine #1)

## 2. The handle and the drag

- [ ] 2.1 `ColumnResizeHandle` rendered on the trailing edge of every header
      whose column has a declared width, and on no other — hand-rolled
      `pointerdown`/`pointermove`/`pointerup` with pointer capture, a
      `pointercancel` that abandons the drag, and no TanStack column resizing
      (it writes into column defs, the one place a width must not live) —
      test: `wbs-table.test.tsx` asserts the handle set equals the sizable
      column set and that Name has none; negative: the handle rendered for
      every leaf column → `the Name column offers no resize handle` watched
      failing
- [ ] 2.2 The drag writes through `floorFor`/`WIDEST_COLUMN` and commits the
      override on pointer-up, not per move — test: `wbs-table.test.tsx` on the
      pure width-from-delta function; the gesture itself is 6.1's, because
      jsdom performs no default action for pointer events and this suite
      cannot tell a working drag from a half-done one

## 3. Persistence, and the sanitizer written negative-first

- [ ] 3.1 `widthOverridesKey(projectId)` → `wbs.columnWidths.<projectId>`, and
      `rememberedWidthOverrides(projectId)` following `rememberedExpansion`
      exactly: unparseable or non-map storage drops the key and returns no
      overrides — test: `wbs-table.test.tsx` storage cases; negative: the
      `isWidthOverrides` guard deleted → the garbage case watched failing with
      the junk reaching the `<colgroup>`
- [ ] 3.2 Per-entry validation, each rule a separate line with its own
      negative watched failing first: (a) an id the frame layout cannot size is
      dropped — negative: the id check deleted → `UnknownColumnError` observed
      from the render; (b) a non-finite width is dropped — negative: the
      `Number.isFinite` check deleted → `NaN` observed on the `<col>`;
      (c) a width outside `[floorFor, WIDEST_COLUMN]` is dropped — negative:
      the range check deleted → a 1e9 width observed laid out. Surviving
      entries still apply, asserted in the same cases (a bad entry must not
      take a good one with it). An id naming a role the project no longer
      holds is asserted harmless, not dropped
- [ ] 3.3 The key is written on drag commit and read on mount; the sanitized
      set is not written back on read — test: `wbs-table.test.tsx` remount
      restores a stored width; the browser half is 6.2

## 4. Precedence and reset

- [ ] 4.1 An override outranks the resolved default, including a dynamic one:
      not-before overridden, then the whole-table not-before predicate flipped
      — the width does not move — test: `wbs-table.test.tsx`; negative:
      precedence reversed so a dynamic default wins, so
      `an override freezes a two-state width` is watched failing
- [ ] 4.2 Reset **removes the key** and drops every override — the column
      returns to the default resolved now. Test seeds an override, flips the
      predicate that moves that column's default, resets, and asserts the
      **new** default; negative: reset re-written to store the current
      resolved widths (the snapshot this rejects) → the case watched failing
      on the old width
- [ ] 4.3 The reset is offered only while an override is in force — test:
      absent on a fresh project, present after a drag, absent again after the
      reset; negative: the condition removed → the fresh-project case watched
      failing

## 5. Placement, and the mobile negative

- [ ] 5.1 The reset renders inside the table renderer's own header region and
      is **not** added to `toolbarControls` — that array feeds both the desktop
      toolbar row and the mobile Plan actions sheet — test:
      `plan-cards.test.tsx` (or the mobile case in `wbs-table.test.tsx`) opens
      the sheet below the breakpoint and asserts no width control; negative:
      the reset moved into `toolbarControls`, so
      `the sheet offers no width control` is watched failing. This is the
      exact placement the first review caught; the assertion is worthless
      without the fault having been run

## 6. The browser is the oracle for the gesture

- [ ] 6.1 `e2e/layout.spec.ts`: at `NARROW` with the frame scrolled, drag the
      Number column's real header edge with a pointer sequence and assert
      **both** — the column's laid-out rectangle moved by the delta, and the
      Name column's pinned `left` moved by the same delta — test: new case in
      the layout gate; fault: the pinned offsets left summing defaults →
      watched failing, and the same fault run against the jsdom suite to
      record that jsdom stays green (the fourteenth/fifteenth shape: the
      oracle has to be a browser)
- [ ] 6.2 Reload with the same account and project: the dragged width is still
      there — fault: the drag-commit write removed → watched failing
- [ ] 6.3 Press the reset: the column and the pinned offsets return to the
      resolved defaults — fault: reset storing a snapshot → watched failing
- [ ] 6.4 `layout.spec.ts`'s existing imports and assertions are re-derived
      through `frameLayout` where T2 left them on constants, and the fit matrix
      re-runs at the widths it already covers

## 7. Gate

- [ ] 7.1 `bunx nx format:check --all` and
      `bunx nx run-many -t test lint typecheck build --parallel=2` and
      `openspec validate --all --json` and `bun run e2e` green; verify.md
      records the commands, their output, and the failure-proof table naming
      the injected fault and the observing test for every negative above
- [ ] 7.2 Deploy to dev and Dany looks — the widths are a judgement call about
      a table, and the only oracle for "is this the right feel" is Dany
