# Verification

## The gate

Run on h1claw, 2026-08-08, on `change/keys-notes-and-fit`.

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects

$ bunx nx run-many -t test lint typecheck --projects=fe-01 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck for project fe-01
      Test Files  25 passed (25)
      Tests       564 passed (564)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
{"items": 38, "passed": 38, "failed": 0}
```

564 fe-01 tests, up from 507 before this branch and 543 before this change:
**5** in the new `mention.test.ts`, **11** in `wbs-table.test.tsx` (the
accordion, the fold copy, six `@` tests, the folded assignee display), **5** in
`table-frame.test.ts` (the flexible column, the compaction, the equation), and
the rest are existing tests re-pointed at the new widths and headings. None was
deleted.

**The browser matrix in `apps/fe-01/e2e/layout.spec.ts` has not been run at
this commit.** h1claw has no browser and does not build. The run is on h2puni
and its results — including faults E to H, which changes 1 and 2 left as
expectations — land in the commit after this one.

## The checks, and the faults that broke them

Every row below was watched failing with the fault in place and passing again
with it removed, one fault at a time, on h1claw on 2026-08-08.

### The width table (`table-frame.test.ts`)

| Check                                         | Fault injected                                                            | What the run reported                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name has no declared width and is flexible    | `['name', 360]` back in `COLUMN_WIDTHS`, `name` out of `FLEXIBLE_COLUMNS` | **1 failed** — `leaves the Name column to the layout, and asks nobody for its width`, on `expected false to be true`                                                        |
| Every fixed column is the compacted figure    | the pre-compaction widths (drag 28, number 168)                           | **1 failed** — `compacts every fixed column to the figure it actually holds`, on `expected { drag: 28, number: 168, …(8) } to deeply equal { drag: 24, number: 100, …(8) }` |
| The equation budgets the floor, not a width   | the `FLEXIBLE_COLUMNS` branch replaced by `widthFor(id)`                  | **1 failed** — `adds a table up from its columns…`, on `UnknownColumnError: No declared width for column "name"`                                                            |
| …and not zero either                          | the same branch replaced by `0`                                           | **1 failed** — same test, on `expected +0 to be 200`                                                                                                                        |
| Only the last pinned column may be flexible   | `PINNED_COLUMNS` reordered to `['name', 'number', 'drag']`                | **the module threw while loading** — `name has no declared width, so number cannot be pinned after it`; the file reported `Tests no tests`                                  |
| The pin declares no width for a flexible cell | `pinnedCellStyle` back to `width: pinned.width ?? 360`                    | **1 failed** — `gives a pinned cell an opaque background and a layer to paint in`, on `expected 360 to be undefined`                                                        |
| The indent leaves the number the larger half  | `INDENT_STEP` back to 16                                                  | **1 failed** — `stops growing, so the Number column cannot outgrow its declared width`, on `expected 64 to be less than 50`                                                 |

### The table (`wbs-table.test.tsx`)

| Check                                                     | Fault injected                                                                           | What the run reported                                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The colgroup declares nothing for a flexible column       | the colgroup made to emit `360` for it                                                   | **1 failed** — `declares every rendered column once, in the order they are rendered`, on `expected ['24px','100px','360px'] to deeply equal ['24px','100px','']`                              |
| The table is the frame's width with the equation under it | `width: tableMinWidth(leafColumnIds)` and no `minWidth`                                  | **1 failed** — `is as wide as the frame, and never narrower than its own equation`, on `expected '1382px' to be '100%'`                                                                       |
| The pinned Name cell carries no width                     | `pinnedCellStyle` back to `width: pinned.width ?? 360`                                   | **1 failed** — `pins the handle, the number and the name, and nothing past them`, on `expected '360px' to be ''`                                                                              |
| A folded role's cell does not clip its `@` list           | the `-final` suffix dropped from `opensAPopover`                                         | **2 failed** — `does not clip the cells whose popovers open over the rows` and `gives every cell the chrome its declared width is measured with`, both on `expected 'hidden' to be 'visible'` |
| One role unfolds at a time                                | `toggleRole` back to `[...current, roleId]`                                              | **1 failed** — `unfolds one role at a time, so the table still fits the window`, on `expected <input …(5)></input> to be null`                                                                |
| The fold button no longer claims to hide the assignee     | the old copy restored                                                                    | **1 failed** — `says what the fold button does…`, on `expected 'Dev — show the three-point estimate a…' to contain 'show the three points behind the figu…'`                                  |
| The mention never reaches the estimate parser             | the `splitMention` call in `commitCombinedEstimate` replaced by `const estimate = typed` | **1 failed** — `never lets the @ half read as an estimate, half-typed or abandoned`, on `expected '@ka' to be '4'` — the mention committed as shorthand                                       |

### What is proven by the gate on this machine

The width table's literals and the three states of the equation; that
`widthFor` still throws for `name` exactly as for a typo; that the `<colgroup>`
declares nothing for it and the `<table>` carries `width: 100%` with the
state's own minimum; that the pinned offsets are 0 / 24 / 124 and the Name cell
declares no width but does declare its floor; that unfolding one role folds the
other and the declared minimum follows; the shortened headings and the `title`s
that took over what they used to say; `splitMention`'s five cases; and the six
behaviours of the `@` picker — filter, one-gesture assign, add, remove-first-on-
a-bare-`@`, the assumed name in grey, and nothing at all where neither holds.

### What only a browser can say — and one thing nothing here can

Not verified at this commit: that the table really fits 1280 and 1512 with the
roles folded, that Name really absorbs the remainder, that the frame really
scrolls below the minimum with Name pinned at 124, that the date input is not
clipped at 108px, that the depends list opens at 260, and that the folded `@`
picker and the actions menu are hit-test visible on the last row at a laptop
width. All of those are the matrix in `e2e/layout.spec.ts`.

**The three-role fixture in the plan's matrix cannot be built at all**, and
that is a gap rather than a postponement. be-01 creates a project with exactly
`Dev` and `QA` (`STARTING_ROLES`, `project.service.ts`) and neither the API nor
the UI offers a way to add a third, so no browser can be shown one. The third
role's cost is asserted as arithmetic instead — `tableMinWidth` for three
folded roles is 1202, in `table-frame.test.ts` — and that is all it is:
arithmetic, not a measurement. Recorded as assumption C3-4.

### Deliberately not covered

A keyboard route to `Remove <name>` other than a bare `@` and Enter; a highlight
in the `@` list (it takes the first entry, exactly as the team and assignee
boxes do); persistence of which role is unfolded; and the parked option of
hiding Start/End/Slack while a role is open, which the plan records and does not
build.
