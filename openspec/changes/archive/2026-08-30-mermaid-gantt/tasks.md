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

## 1. The type stops narrowing what the object already holds

- [x] 1.1 `ExportSlice` becomes `SliceView` in `plan-export.ts` — an alias, not
      a hand-written superset, so the two cannot drift. `plan-export.test.ts`'s
      `slice()` fixture fills the whole shape. No producer changes:
      `planForExport` was already assigning `chartRead.slices`. The docstring's
      "`effort` and `duration` are read by nothing" is corrected to `effort`
      alone — the diagram writer reads `duration` to tell a slice nobody
      estimated from one estimated at zero.

## 2. The fence

- [x] 2.1 `planToMermaid` emits the header — `gantt`, `title`, `dateFormat
YYYY-MM-DD`, `inclusiveEndDates`, `excludes weekends`, then the comment
      block. Tests: `opens with gantt and declares the format, the inclusivity
and the weekends`, and the three comment tests.
- [x] 2.2 One task per slice, in row order then role order, with the row's
      number and name, its phase and whoever is on it. Tests: `draws one task
per slice, in row order and then role order`, `names whoever is on the bar,
and says nothing where nobody is`, `tags the critical path`.
- [x] 2.3 Sections from the outermost ancestor. Test: `groups a branch under its
outermost ancestor, whatever its depth`.
- [x] 2.4 Dates through `calendarScale` — the chart's own reading, whose
      docstring records four watched faults from getting `endOf` wrong — then
      rounded outward. Tests: `ends a bar on the last day the work is still
on`, `carries a bar over the weekend the working days skip`, `rounds a
fractional slice outward rather than drawing it short`, `begins a plan whose
start date is a Saturday on the Monday after it`.

## 3. The two guards, each with its watched red

- [x] 3.1 **The end clamp.** `endOf` reads the left limit of a whole workday, so
      a zero-length slice ends the day before it starts without
      `Math.max(first, …)`. Guard test: `never ends a bar before it starts`.
      Negative test: the clamp struck — verify.md fault 1.
- [x] 3.2 **The bounded ancestor walk.** A `parentId` loop in a document would
      hang the copy button. Guard test: `terminates on a parent chain that runs
in a circle`. Negative test: the `seen` set removed — verify.md fault 2,
      where the test does not fail, it times out.

## 4. The refusals

- [x] 4.1 No start date, a cycle, and nothing placed each return a sentence and
      **no diagram**, so a Copy button cannot paste a refusal into an issue.
      Tests: the four in `the refusals`.

## 5. The escaping

- [x] 5.1 `:` → U+2236, `%%` → `%`, line breaks collapsed, and **nothing else**:
      a comma, a `#` and a `;` terminate metadata, and nothing anybody typed
      reaches the metadata position. Tests: the five in `the escaping`.
      Ordinary assertions, not watched reds — they are string rules, and the
      claim they rest on (the gantt lexer) is M5's to watch.

## 6. The record

- [x] 6.1 `proposal.md`, this file, the delta spec, `verify.md`. **No
      `design.md`** and no citation table: PoC-mode contract, 2026-08-14.
- [x] 6.2 **Not done here: the Copy as Mermaid button.** `wbs-table.tsx` is
      **Closed 2026-08-29 without work:** wire-export-buttons 1.1 built `copyAsMermaid`; the control is in `wbs-table.tsx`.
      another agent's file this afternoon and this change was told not to touch
      it. The exact patch — handler, button, and the test it needs — is in
      `verify.md`. Left unticked deliberately: M1 is not on screen until it
      lands.
