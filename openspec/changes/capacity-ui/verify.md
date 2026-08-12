# verify — `capacity-ui`

Branch `change/capacity-ui`, cut from `main` @ `2be2b25` (#52 gantt-handle-z, #53
capacity-write-paths, #54/#55 unfolding-may-scroll all merged) on 2026-08-12.

fe-01 only. Ten source files, six test files, one e2e spec, four artifacts. **No
be-01 change, no gw-01 change, no migration and no wire change** — every field
this change reads has been on the payload since C1, and every route it calls has
existed since C2. What moves is what a reader can see and type.

**This change disarms the deploy gate.** `LLM_README.md` has carried
_"DEPLOY GATE STILL ARMED: C2 merged but C3 not started — next hand-run
`./bin/dev-deploy.sh` hits `floorWordsOf` throw on `boundBy:'capacity'`"_ since
#53 merged. The mandatory watched red below is the proof that it is now safe;
the line comes out of `LLM_README.md` on merge, not before.

## The gate

Run on **h2puni** over ssh, 2026-08-12/13. Nothing was compiled or tested on
h1claw; that box denies both.

| target                                                  | result                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | clean                                                                                                                                                |
| fe-01 unit (`node vitest run`)                          | **1,265 pass across 48 files, 0 fail**, 55.96s                                                                                                       |
| fe-01 e2e (Playwright image, Chromium)                  | **163 pass, 0 fail**, 5.5m — first attempt, no rerun                                                                                                 |
| `bun test` in `apps/be-01`                              | 680 pass, 0 fail, 24,320 `expect()` calls, 11.49s — untouched by this change, run because it owns the payload fe-01 now reads three new fields of    |
| `bunx nx run-many -t lint typecheck`                    | pass, 21 projects                                                                                                                                    |
| `bunx nx run-many -t build`                             | **not run here.** `tool-bootstrap` and `tool-devsync` refuse without `shellcheck`, which h2puni does not have. CI runs it and is the gate of record. |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | 41 items, 41 passed, 0 failed                                                                                                                        |

`nx run fe-01:test` is **not** how the unit suite was run: under bun on h2puni
that target runs zero tests and exits 0 (three agents have hit it). The suite is
run through `node ../../node_modules/vitest/vitest.mjs run` with node on `PATH`.
The e2e suite runs in `mcr.microsoft.com/playwright:v1.62.1-noble`, because
h2puni has no sudo for `playwright install-deps`.

The first full unit run of this branch's tree — after the implementation and
before its tests were written — was **1,238**. The 27 added are this change's.

**CI:** run
[31648271596](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31648271596)
at head `01ca5d6` **failed `gate`** — and it failed on this file's sibling, not
on any code: `LLM_README.md` came to **152 lines against its 150-line cap**,
because the landmine's exit note was written as two extra lines rather than
folded into the three already there. `pixels` passed, 7m31s. Recorded rather
than quietly replaced: the doc-cap hook is a real gate and the fix is to
compress the note, not to raise the cap. The only commit between that head and
the green one is the compression plus this paragraph.

## The failure-proof table (R5)

Eleven checks, eleven injected faults, each watched failing before it was
believed. Every `Proof:` comment in the diff quotes the output below rather than
a reconstruction of it.

| check                                                 | injected fault                                                                 | observed failure                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **the deploy gate** — `floorWordsOf` knows `capacity` | the `case 'capacity':` arm struck, so `default:` catches it again              | **both** tests of `the deploy gate: a plan a sized team is holding back` — `expected 'The chart cannot be drawn: slice seal…' to be null` and `no bar on the chart for sealing`, against four uncaught `GanttDataError: slice sealing::role-dev is held by capacity, which this chart has no words for`. The whole chart replaced by the fault boundary, on a plan be-01 schedules every day. |
| a capacity floor names its display referent           | the throw replaced by `return 'Waits for a team'`                              | `throws when a capacity floor names no display referent` alone — `expected function to throw an error, but it didn't`                                                                                                                                                                                                                                                                         |
| a capacity floor carries a blocking set               | the throw deleted and the count clamped with `Math.max(0, n - 1)`              | `throws when a capacity floor says nothing was holding the pool` alone — `expected function to throw an error, but it didn't`                                                                                                                                                                                                                                                                 |
| a capacity-floored row names a team                   | the throw replaced by `poolNameOf(team) ?? 'its team'`                         | `throws when a capacity-floored row names no team to be short of` alone — `expected function to throw an error, but it didn't`                                                                                                                                                                                                                                                                |
| the In-parallel column holds `999`                    | the declared width set to 24                                                   | `the In-parallel column holds three digits at the grid's own type` — `in-parallel declares 24px where "999" needs 30`. Chromium, h2puni.                                                                                                                                                                                                                                                      |
| the date columns still hold the day envelope          | `DATE_COLUMN_WIDTH` set to 94                                                  | `is as wide as the widest day the formatter can print` — `start declares 94px where the widest day it can print, "20 May 2027 ?", needs 95`. Chromium, h2puni.                                                                                                                                                                                                                                |
| the In-parallel cell refuses a non-finite draft       | the `Number.isFinite` guard deleted                                            | `refuses a draft JSON cannot carry, rather than silently resetting the row` — `Unable to find an element with the text: /People at once is a whole number from 1 to 1000./`. The typed `1e999` sent as `null`, which is the reset.                                                                                                                                                            |
| the export resolves inheritance over every row        | `teamsInForce` narrowed to `plan.rows.filter((r) => r.serviceTeamId !== null)` | `resolves the inherited label against every row of the plan` and `names the team a row inherits` — `expected '' to be 'Billing, Ltd (inherited from 010 Root)'`. Every inheriting row reported teamless.                                                                                                                                                                                      |
| the cards read the **effective** team                 | `teamLabel` pointed back at `teamLabelOf(row.serviceTeamId)`                   | `marks a team a row only inherits, and names where the label was written` — `expected undefined to be '↳ Billing'`. The inheriting card drew no team line at all.                                                                                                                                                                                                                             |
| an emptied size box clears rather than zeroes         | the empty-box arm replaced by the plain `Number(typed)`                        | `clears to unstated when the box is emptied, rather than sending a zero` — `expected [ [ 't1', 4 ], [ 't1', +0 ] ] to deeply equal [ [ 't1', 4 ], [ 't1', null ] ]`. The page asking for a team of nobody.                                                                                                                                                                                    |
| the size draft survives the name's Escape             | the name's Escape pointed at the both-drafts `forgetDraft`                     | `keeps a half-typed size when the name beside it is escaped` — `expected '' to be '7'`                                                                                                                                                                                                                                                                                                        |

Two of these are **browser** injections rather than jsdom ones, and that is the
point of them: a column width is a claim about drawn glyphs, and no unit test in
this repo can judge one.

## What is **not** proved, and said so

- **No live plan has been through this.** The deploy gate stays armed until this
  merges, so nothing here has been dev-deployed and nobody has typed a number
  into a real directory. Every claim is a test's.
- **`build` did not run on h2puni** (no `shellcheck`). CI is the only evidence
  for it.
- **`Ran at` is exercised with hand-built slices, not with a scheduled plan.**
  `plan-export.test.ts` builds its `ExportSlice`s directly, because the table's
  fake schedules everything at width 1 and making it divide effort by width
  would move date assertions in four hundred unrelated tests. The wiring — that
  the export really receives `chartRead.slices` — is typechecked and is asserted
  through `planForExport`'s dependency list, not through a placement.
- **The In-parallel cell has no e2e of its own.** The e2e added measures the
  column's **width**; the cell's three states and its place in the keyboard grid
  are jsdom's alone (`Tab moves between the fields, from every cell`, and the
  Ctrl+L chord test that now lands in it). No browser has typed into this cell.
- **The directory concurrency test C2 owed is still owed**, and this change
  argues it does not apply — see `design.md`, "What this change does not do".
- **No screenshot was compared.** `layout.spec.ts`'s picture test writes its
  artefact; nobody looked at it. The In-parallel column is 32px of new furniture
  in a table Dany reads daily, and the eye that has to judge it is his.

## Overlap with PR #56 (`change/unified-scroll-docking`, unmerged)

`comm -12` over both branches' changed-file lists gives **four** files, all in
`apps/fe-01/src/components/wbs`:

- **`wbs-table.tsx` / `wbs-table.test.tsx`** — the real overlap. #56 has
  import, effect and ref hunks around the frame and the scroll link; this change
  adds the In-parallel column, `setParallelism`, `effectiveTeamLabelOf` and the
  `planForExport` slices. Different regions of a 7,000-line file, but the import
  block and the `live` ref object are shared ground and will want a hand.
- **`table-frame.ts` / `table-frame.test.ts`** — **not** the overlap the PR body
  warned of. #56's hunks are entirely inside `tableWidthStyle`'s docstring and
  its flex declaration (`1 1 0%` → `0 1 auto`); this change's are
  `COLUMN_WIDTHS` and `DATE_COLUMN_WIDTH`, several hundred lines away. Neither
  moves the other's number.

The two files the warning named — **`hover-card.tsx`** and
**`e2e/hover-cards.spec.ts`** — are **not** touched by this branch, and neither
is `e2e/gantt.spec.ts`. That is deliberate rather than lucky: the "cards" of
C3's scope are `plan-cards.tsx`, the phone renderer, and the hover surfaces
needed nothing.

Whichever merges second rebases. Nothing here depends on #56 landing, and #56's
own re-measurement of the frame height is unaffected by two columns changing
width inside it.

## Plan versus reality

In `design.md`, one row per divergence, six of them. The two worth reading
before the diff: the In-parallel column is 32px rather than the plan's 48, paid
for out of the date columns' measured slack (D3); and the export gained two
columns rather than one, because width is decided per slice (D5).
