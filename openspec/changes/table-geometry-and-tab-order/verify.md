# Verification

## The gate

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   21 files   477 pass  0 fail   (445 before this change, +32)

$ bunx nx run-many -t test lint typecheck --projects=fe-01 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck for project fe-01
      Test Files  21 passed (21)
      Tests       477 passed (477)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
{"items": 35, "passed": 35, "failed": 0}
```

The 32 new fe-01 tests: 5 in `table-frame.test.ts`, 13 in `box-geometry.test.ts`
and 14 in `wbs-table.test.tsx` (6 for the widths and the column names, 8 for
Tab).

**The eight tests in `apps/fe-01/e2e/layout.spec.ts` are not in any figure
above, and have never been run.** There is no browser on the machine this
change was written on and installing one was out of scope, so the layout gate
has been verified as far as a machine without a rendering engine can verify it
— see "What is proven, and by what" below — and no further. It runs for the
first time in CI's new `pixels` job.

## The checks, and the faults that broke them

Every row was watched failing with the fault in place and passing again with it
removed, on 2026-08-07, except the four rows marked **PENDING** at the end.

### The widths

| Check                                                                    | Fault injected                                                                                    | What the run reported                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The pinned offsets are prefix sums of the width table (`table-frame.ts`) | `PINNED_COLUMNS` written back out by hand with `number` at 180 instead of derived from `widthFor` | `is the same table the pinned offsets are prefix sums of` failed on `expected 180 to be 168`; in the same run the pre-existing `starts at the left edge and stacks each column after the last` failed on `{left: 28, width: 180}` against `{left: 28, width: 168}` |
| An unsized column id is an error, not a width (`widthFor`)               | `throw new UnknownColumnError(columnId)` replaced by `return 120`                                 | `treats an id it never renders as an error, not a plausible width` failed on `expected function to throw an error, but it didn't`                                                                                                                                  |
| The colgroup declares the columns **in order** (`wbs-table.tsx`)         | the colgroup rendered from a reversed id list                                                     | `declares every rendered column once, in the order they are rendered` failed on `['110px','260px','90px']` against `['28px','168px','360px']`                                                                                                                      |
| The popovers are not clipped by the new `overflow: hidden`               | `overflow: 'hidden'` added to the dependency cell's wrapper span                                  | `still lets the things that must leave a cell leave it` failed on `expected 'hidden' not to be 'hidden'`                                                                                                                                                           |
| Every cell names its column (`wbs-table.tsx`)                            | `data-column` dropped from the `td`                                                               | `names every cell with the column it belongs to, in both halves of the table` failed on a row of `null`s against the header's names                                                                                                                                |

Four more in this group were watched failing before the code existed rather
than by injection — written first, run against the unmodified component:
`declares every rendered column once` (`expected +0 to be 18`), `is as wide as
its columns add up to` (`expected '' to be 'fixed'`), `gives every cell the
chrome its declared width is measured with` (`expected '' to be 'hidden'`), and
`lets no control in a cell assert a width of its own`
(`expected ['100%','auto',''] to include '22em'`).

### Tab

| Check                                                            | Fault injected                                                         | What the run reported                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A caret is only asked of an element that has one (`focusCellAt`) | the element check removed, so `setSelectionRange` reaches a date input | `the arrows land in a date cell without asking it for a caret it has none of` failed on `expected [ …(2) ] to deeply equal []` — the test collects `window` error events, because as a bare focus assertion the `InvalidStateError` surfaced as a run-level uncaught error attributed to no test |
| Disabled cells are outside the grid (`editableGrid`)             | `:not([disabled])` dropped                                             | `steps over the date cell until the plan is on a calendar` failed with the key taken and nothing landed                                                                                                                                                                                          |
| Read-only cells are outside the grid (`editableGrid`)            | `:not([readonly])` dropped                                             | **2 failed**: `never stops on a parent's rolled-up figures` (the focus moved onto the parent's box instead of staying) and `Shift+Tab steps over a parent's read-only estimate boxes` (landed on `Dev pessimistic … readonly=""` instead of the team box)                                        |
| Every cell handles Tab (`wbs-table.tsx`)                         | `onTabKey` dropped from the notes cell's chain                         | `walks every field of a row in turn, and on into the next row` failed, `Notes for 010` where `Name of 020` was expected                                                                                                                                                                          |
| A picker handles Tab (`creatable-picker.tsx`)                    | `gridCell?.onTabKey(e)` dropped, leaving the bare `return`             | the same walk failed at `Service or team for 010`                                                                                                                                                                                                                                                |
| The dependency box handles Tab (`wbs-table.tsx`)                 | its Tab branch dropped, leaving the bare `return`                      | **2 failed**: `Tab from the depends input closes the picker, discards the typed search, and moves once` and `Shift+Tab from the depends input lands in the name, not on a chip button`                                                                                                           |
| The grid does not wrap at its edge (`focusAdjacentCell`)         | the `at + delta < 0` guard removed, so the index reaches `.at(-1)`     | `at the edges of the grid the key is left to the browser` failed — the key was taken and the focus jumped to the last cell of the table                                                                                                                                                          |

Seven of the eight Tab tests were also watched failing before the feature
existed. The eighth, `at the edges of the grid the key is left to the browser`,
passed against the unmodified component — it asserts what the browser is left,
which a table that does nothing satisfies — and is kept honest by the
wrap-around fault in the last row above.

### The layout gate's arithmetic

The predicates the browser spec asserts with live in
`src/components/wbs/box-geometry.ts`, deliberately: everything about this
change that can be tested without a rendering engine has been pulled out to
where the repo gate runs it.

| Check                                                      | Fault injected                                           | What the run reported                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The half-pixel tolerance exists (`findOverlap`)            | `EDGE_TOLERANCE` dropped from the comparison             | `forgives a half-pixel, which is a border rounding and not an overlap` failed                  |
| …and does not swallow a real overlap                       | (asserted, not injected) a box 0.6px over its neighbour  | `reports more than a half-pixel, so the tolerance cannot swallow a real overlap` passes        |
| Adjacency is pairwise (`findOverlap`)                      | the walk kept the first box rather than the previous one | `reports the first offending pair rather than the last` failed                                 |
| A control overrunning to the right is seen (`findOverrun`) | the right-edge branch replaced by `return undefined`     | `says which edge a control ran past on the right` failed on `expected undefined to be 'right'` |
| The tolerance exists on the left edge too (`findOverrun`)  | `EDGE_TOLERANCE` dropped from the left-edge branch       | `forgives a half-pixel on either edge` failed on `expected 'left' to be undefined`             |

All thirteen were also watched failing before the module existed
(`Failed to resolve import "./box-geometry"`).

### PENDING — the browser gate itself

**None of these has been observed.** AGENTS.md R5: a check whose failure mode
has never been observed is a claim, not a gate. The three faults are written
out as one-line changes at the foot of `apps/fe-01/e2e/layout.spec.ts`. This
table is the record they have to be entered into before this change is merged.

| Check                                                                                                                   | Fault to inject                                                                                              | Expected failure                                                                                                                       | Status      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| A control stays inside its cell (`keeps every control inside the cell it belongs to`)                                   | `['name', 360]` → `['name', 100]` in `table-frame.ts`, and the Name cell's `width: '100%'` → `width: '22em'` | one entry in the list, naming `Name of 010 … runs past the name cell`                                                                  | **PENDING** |
| Two width tables again (`lays every body row out with no two cells on top of each other`, and the heading-row test)     | `PINNED_COLUMNS` replaced by literals with `number` at 180                                                   | both adjacency tests fail: Name pinned at 208 while the colgroup lays it out at 196, so it sits 12px into "Depends on" even unscrolled | **PENDING** |
| The pin itself (`holds the pinned columns there once the table is scrolled sideways`, and the `elementFromPoint` probe) | `position: 'sticky'` dropped from `pinnedCellStyle`                                                          | the measured lefts come back negative, having scrolled away with the row; the probe's `inside` names some other column                 | **PENDING** |
| The gate runs at all (the `pixels` job)                                                                                 | —                                                                                                            | eight tests reported, and `wbs-table.png` in the uploaded artifact                                                                     | **PENDING** |

**Fault A is the one to read carefully.** The obvious expectation — "a control
that overruns its column shows up as an overlap" — is wrong, and writing it
down is the point: a table never lays two cells on top of each other, so a
`22em` box in a 100px column is only ever visible as _containment_. If the
containment test were dropped as redundant, that fault class would pass the
gate untouched. The adjacency tests catch the other half, where the offsets and
the layout disagree (fault B), and the two halves are not substitutes.

## What is proven, and by what

**Proven by the repo gate, on this machine:** the width table and its
consumers, the Tab grid, and the geometry predicates — 477 fe-01 tests, the
fault tables above.

**Proven by running the stack, on this machine:** `bun run e2e` was run to the
point of failure. `dev:setup` seeded three `.env` files, all three servers
started from their own directories, be-01 migrated a brand-new
`tmp/e2e-<ms>.db` (176KB of schema, `local.db` untouched), and Playwright's
health waits on `:3100/health`, `:3200/health` and `:4200` all resolved — the
run reached test execution and failed on
`browserType.launch: Executable doesn't exist … chrome-headless-shell`, eight
times. The webServers were torn down cleanly afterwards. So the config, the
readiness, the database isolation, the ports and the Nx wiring are verified;
the assertions are not.

**Verified as text, not as behaviour:** the spec transpiles, resolves both of
its imports of application source, and enumerates its eight tests
(`playwright test --list`); it passes `eslint` and `tsc --build` through a new
`tsconfig.e2e.json` — and that typecheck was proven non-vacuous by putting
`const x: number = 'nope'` first in the spec and then in the config and
watching each fail, because `nx typecheck` running against a solution-style
config and compiling nothing is a failure this repo has already had once.

**Not verified at all:** every assertion in `layout.spec.ts`. No rectangle in
this change has been measured by a rendering engine. The four PENDING rows
above are the whole of what CI has to establish.

## What is not verified here, beyond the browser

**No second engine.** Chromium only. A layout that Firefox or WebKit disagrees
about is out of this gate's scope and always was.

**The `select()` half of the date-cell guard is still unproven.** jsdom's
`select()` does not throw on a date input, so only the `setSelectionRange` half
was watched failing. The real-engine behaviour is inherited from the brief's
claim. The Tab walk in `layout.spec.ts` passes through the date cell only when
a project has a start date, which the seeded plan does not — so the browser run
will not settle this either. Stated rather than left to be assumed.

**The pickers are Tab destinations, not arrow sources.** Left and right at the
caret's edge do not leave a `CreatablePicker`. Deliberate, out of scope, and
recorded in the proposal's non-goals rather than fixed quietly.

**The widths are not proven to be _good_.** Nothing here can be: `1956px` of
declared table on a 1400px viewport reads however it reads. The screenshot
artifact exists for that judgement and for nothing else — it is not a baseline,
and no test compares against it.

**`apps/fe-01/tsconfig.spec.json` is still outside the gate**, unchanged, as
`teams-and-assignees/verify.md` recorded. The new unit tests were run, not
type-checked. `tsconfig.e2e.json` is new and _is_ in the gate, so the browser
spec is type-checked even though it cannot be run.
