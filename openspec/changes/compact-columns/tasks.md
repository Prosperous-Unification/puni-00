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

## 1. The resolved frame layout

- [x] 1.1 `frameLayout(leafIds: readonly string[], state: FrameLayoutState)` in
      `table-frame.ts` — one object per render holding each leaf column's
      declared width (or its flexibility), the table minimum, and the pinned
      columns' offsets. `FrameLayoutState` is the one object every fact a width
      may depend on goes into, so a later fact is a field rather than a third
      argument: `{ hasAnyNotBefore: boolean }` today, and
      `{ hasAnyNotBefore: boolean; columnWidthOverrides?: Map<string, number> }`
      once T1 `column-widths-drag` adds its field — that spelling is shared
      with T1's tasks 1.1–1.3 and must not drift from them — test:
      `table-frame.test.ts` asserts the colgroup widths, the minimum and the
      offsets for a folded and an unfolded state, and that the pinned offsets
      are the prefix sums of the widths the same call reports
- [x] 1.2 The two guards move onto the derived path and stay breakable — an
      unsized id throws `UnknownColumnError`; a column pinned after a flexible
      one throws, since a sticky offset is a sum of widths in front of it —
      test: `table-frame.test.ts` refusal cases; **two** negatives, one per
      guard: (a) with the `UnknownColumnError` throw replaced by a fallback,
      `frameLayout` called with an id nothing sizes is observed handing back an
      `undefined`/`NaN` width for that `<col>` and a table minimum short by it,
      watched failing, then restored; (b) with the flexible check deleted, a
      fourth pinned column declared behind `name` resolves to a plausible
      offset and the test observes it — watched failing, then restored. Both
      `Proof:` comments name the injected fault and the observing test. The old
      module-load throw fired at import; the derived one must fire per call,
      which is what these negatives are really proving.
- [x] 1.3 `foldedTableMinWidth(roleIds, state)` — the project's **real** role
      ids, not a count — derived from `frameLayout` rather than from its own
      sum: it delegates to `frameLayout` with the fixed columns, the flexible
      one, and one folded column id per role — `<roleId>-final` for each of
      `roleIds` — and the same `state`. `phases-dialog.tsx` passes the roles it
      is already rendering. Synthetic `phase0-final` ids are dropped here
      rather than in T1: they resolve to the same 96 today, but T1 stores an
      override under the exact column id, so a stand-in id could never see one
      — test: `phases-dialog.test.tsx` pins the quoted figure against a real
      render's `min-width` for the same roles (the existing pin, re-pointed)
      and asserts the ids the dialog resolves against are the project's own
      role ids; negative: the dialog left on a hand-written sum while
      `frameLayout` narrows `not-before` → the pin observes the two
      disagreeing, watched failing
- [x] 1.4 `wbs-table.tsx`'s `<colgroup>`, the table's `min-width` and
      `pinnedCellStyle` all read one `frameLayout` call per render; no width
      enters a column definition and the `columns` memo's dep array stays
      `[roles, unfoldedRoles]` — test: `wbs-table.test.tsx` asserts the
      rendered `<col>` widths and `min-width` equal `frameLayout`'s numbers for
      the rendered state; negative: a width threaded through a column def
      instead → `keeps the focus and the half-typed value` style assertion sees
      the remount eat a half-typed name, watched failing, then restored

## 2. Two typed formatters

- [x] 2.1 `short-date.ts`: `shortIsoDate(iso, today)` reading year, month and
      day out of the string — `1 Jun`, `1 Jun 2027` off `today`'s year — test:
      `short-date.test.ts` covers same year, other year, `2026-12-31` and
      `2027-01-01`, and a malformed string throwing rather than defaulting;
      negative: implemented as `new Date(iso)` instead, with the suite's `TZ`
      set to a zone behind UTC → `1 Jun` comes out `31 May`, watched failing,
      then restored, with a `Proof:` comment naming the zone and the case
- [x] 2.2 `shortInstant(epochMs, now)` in the browser's own zone, same two
      forms — test: `short-date.test.ts` with a fixed `now`, both years, and a
      UTC-midnight instant asserted against the zone the test runs in (the
      stated no-display-timezone stance, asserted rather than assumed)
- [x] 2.3 Start and End cells print `shortIsoDate` with the full ISO in
      `title`; the workday-offset fallback, the em-dash for a schedule that did
      not compute, and finish's ` ?` marker are unchanged — test:
      `wbs-table.test.tsx` for all four cases (dated plan, undated plan, failed
      schedule, unestimated row)

## 3. The edit-exit contract

- [x] 3.1 `DateField` grows `onExit('commit' | 'cancel')`: Enter commits then
      exits, blur commits then exits, Escape exits without committing — test:
      `date-field.test.tsx` one case per transition, plus the existing
      segment-typing and half-typed-date cases unchanged
- [x] 3.2 Escape reports the exit and commits nothing of its own — test:
      `date-field.test.tsx` `Escape exits without committing`: a day typed,
      Escape pressed, `onExit('cancel')` called once and `commit` not called.
      That is all this suite can honestly claim. The blur Escape causes is
      **not** proved here: the editor is unmounted on the way out, and an
      unmounted field receives no blur — jsdom would have to be handed a
      synthetic blur the production path never delivers, which is a check that
      cannot fail (R5, and the shape of #14/#15). The suppression is 3.6's.
- [x] 3.3 The `not-before` cell renders the short date at rest (em-dash for
      none) and mounts `DateField` only for the cell being edited, at most one
      on the page; the no-start-date state stays a rendered disabled cell with
      its `title` — test: `wbs-table.test.tsx` at-rest text, em-dash, one
      editor at a time, disabled state
- [x] 3.4 Closing an editor returns the focus to its cell, and the cell keeps
      its `data-cell` and the table's Tab handling — test:
      `wbs-table.test.tsx` focus assertions per exit route
- [x] 3.5 A refetch mid-edit follows the grid's refused-draft rules: the
      half-typed day is not overwritten — test: `wbs-table.test.tsx` beside the
      existing `never writes an answer over a reader who is in the box`;
      negative: the `document.activeElement` guard deleted → the peer's answer
      lands in the box, watched failing, then restored
- [x] 3.6 Chromium proves what jsdom cannot perform: Escape after typing leaves
      the stored day untouched — including through whatever the browser does
      between the keystroke, the focus returning to the cell and the editor
      unmounting, which is the real blur this contract has to survive and the
      one jsdom never delivers; a day picked from the native calendar popup is
      saved when the field is left; Tab out of the segments does not lose the
      edit — test: `e2e/keyboard.spec.ts`, each watched failing with the
      matching handler removed, and the Escape case watched failing with the
      blur suppression removed while `date-field.test.tsx` stays green — the
      `Proof:` comment on the suppression names that pair. jsdom performs no
      default action, which is the R5 #14/#15 fault class this exists for.

## 4. Two narrower columns

- [x] 4.1 `frameLayout` resolves `not-before` to 84 while any row **in the
      project** sets an earliest start, and to 56 when none does; the heading
      abbreviates with the full sentence in `title` — test:
      `table-frame.test.ts` both states, and `wbs-table.test.tsx` a plan whose
      only dated row is collapsed and one whose only dated row is filtered out
      by a search, both still 84; negative: the predicate computed from the
      shown rows instead of the project → the collapsed-row case resolves 56
      and the test observes the column changing width under a reader, watched
      failing, then restored
- [x] 4.2 The Number width oracle measures the **envelope**, not an unbounded
      number: `NUMBER_ENVELOPE` in `table-frame.ts` is the eleven-character
      case — three for a root label plus a dotted single-character segment per
      level down to `DEEPEST_INDENT` — with a JSDoc naming why there is no
      longest number to measure instead (`deriveNumbers` widens with sibling
      count, adds a segment per level, and appends a digit per insertion
      against a frozen anchor, unboundedly). A browser test seeds that row at
      `DEEPEST_INDENT`, frozen so the lock is on it, measures what the cell's
      content needs, and the width `frameLayout` declares is asserted against
      that measurement — test: `e2e/layout.spec.ts`,
      `the Number column fits its envelope`.
      The number is whatever that measurement picks; 72 is not assumed.
      Negative: the column declared at 56 → the measurement exceeds it and the
      assertion fails, watched, then the measured number is pinned.
- [x] 4.3 Past the envelope the cell clips and tells the truth: the Number cell
      truncates rather than wrapping or widening, and carries the full number
      in `title` — test: `wbs-table.test.tsx` a row whose number is longer than
      the envelope keeps the declared width and holds the whole number in
      `title`, and `e2e/layout.spec.ts` asserts that row's cell is clipped
      (`scrollWidth > clientWidth`) while the column's laid-out width is
      unchanged from the envelope case; negative: the `title` dropped → the
      jsdom case fails, watched; and the truncation replaced by wrapping → the
      browser case observes the row growing taller, watched failing

## 5. `layout.spec.ts` re-derived

- [x] 5.1 `measure()` no longer requires a first-row `input[type="date"]`: it
      measures the `not-before` **cell** at rest, and opens the cell for
      editing to measure the input and the browser's unconstrained intrinsic
      width — test: `e2e/layout.spec.ts` both at-rest states (a project with a
      day set, a project with none) and the edited state
- [x] 5.2 The intrinsic-width assertion keeps its teeth on the edited state —
      negative: `not-before` deliberately declared at 60px, the editor opened,
      and the intrinsic check watched failing (`scrollWidth <= clientWidth` was
      the check that could not fail here on 2026-08-08; it stays out)
- [x] 5.3 The fit matrix re-runs across the existing viewports with the new
      widths, both folded and one role unfolded — test: `e2e/layout.spec.ts`
      existing matrix, with `equationFor` reading `frameLayout`

## 6. Cards print the same dates

- [x] 6.1 `plan-cards.tsx` renders spans through the same formatter the columns
      use — test: `plan-cards.test.tsx` a dated plan and an undated one;
      negative: the cards left on raw ISO → the parity assertion observes
      `2026-06-01` against the table's `1 Jun`, watched failing, then restored

## 7. Gate

- [x] 7.1 `bunx nx format:check --all`,
      `bunx nx run-many -t test lint typecheck build --parallel=2` and
      `openspec validate --all --json` green; `verify.md` records the commands,
      their output, and the failure-proof table naming every injected fault
      above and the test that observed it
- [ ] 7.2 Deploy to dev and Dany looks — the two at-rest column widths, a short
      date, and an Escape that abandons an edit
