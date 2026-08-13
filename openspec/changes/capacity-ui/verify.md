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
#53 merged. The mandatory watched red below is the proof that it is now safe,
and **the landmine comes out in this branch's own last commit** — so it leaves
`LLM_README.md` at the moment this merges and not a commit before.

## The gate

Run on **h2puni** over ssh. The table below is the **rebased** tree
(base `main@66ef012`, #56 merged), re-run in full on 2026-08-13 after the
cross-review's three P2 fixes; the earlier `2be2b25`-based numbers it replaces
are kept in the paragraph under it. Nothing was compiled or tested on h1claw;
that box denies both.

| target                                                  | result                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | clean                                                                                                                                                |
| fe-01 unit (`node vitest run`)                          | **1,295 pass across 49 files, 0 fail**, 51.14s                                                                                                       |
| fe-01 e2e (Playwright image, Chromium)                  | **not re-run on the rebased tree.** 163 pass / 0 fail / 5.5m at `2e831ce`; CI's `pixels` job is the record for this head.                            |
| `bun test` in `apps/be-01`                              | 680 pass, 0 fail, 24,318 `expect()` calls, 15.62s across 54 files — untouched by this change, run because it owns the payload fe-01 reads            |
| `bunx nx run-many -t lint typecheck`                    | pass, 21 projects                                                                                                                                    |
| `bunx nx run-many -t build`                             | **not run here.** `tool-bootstrap` and `tool-devsync` refuse without `shellcheck`, which h2puni does not have. CI runs it and is the gate of record. |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | 42 items, 42 passed, 0 failed                                                                                                                        |

The 1,295 is up from the 1,265 measured at `2e831ce`: **six** are the tests the
P2 fixes are pinned by — one in `gantt-geometry.test.ts`, one in
`gantt-panel.test.tsx`, three in `wbs-table.test.tsx`, one in
`directory-page.test.tsx` — and the rest came with #56 through the rebase.
`openspec validate` is 42 rather than 41 for the same reason: #56's change is in
the count now.

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

The green run is
[31648887284](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31648887284)
at head `5d0521b` — `gate` pass 3m25s, `pixels` pass 8m09s, both on their first
attempt, conclusion `success`. The commit after `5d0521b` adds this paragraph
and nothing else. Run
[31649495823](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31649495823)
is the same pair green at `2e831ce`, the head the cross-review read.

**The run of record for the merged head** is
[31682098351](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31682098351)
at `8675cc4` — the rebased tree with the three P2 fixes on it. `gate` pass
3m43s, `pixels` pass 8m57s, both first attempt, conclusion `success`. `pixels`
is the only evidence for the e2e suite at this head, and `gate` the only
evidence for `build`, which h2puni cannot run.

**One flake, recorded rather than quietly re-run.** The commit adding the
paragraph above is `verify.md`-only — `git diff 8675cc4 1175bb4` touches one
file — and its run
[31682877355](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31682877355)
still failed `pixels`: `dark-mode.spec.ts` › `is dark at the first paint`, a
60s timeout inside the `beforeEach` seed waiting for `Dev estimate for 020`,
with the log full of `[vite] ws proxy socket error: write ECONNRESET` around
it. **168 passed, 1 failed.** `gate` passed in the same run. That is the
ws-proxy ECONNRESET class already on the repo's record — it flaked once before
on a markdown-only diff (`f8b7d62`) — and a docs-only diff cannot reach a
`fill()`. `gh run rerun --failed` on the same head passed. The head merged is
`1175bb4` with both jobs `success`.

## The failure-proof table (R5)

Sixteen checks, sixteen injected faults, each watched failing before it was
believed. Every `Proof:` comment in the diff quotes the output below rather than
a reconstruction of it. The last five are the cross-review's three P2s, and each
of those five was written and watched **red against the shipped branch** before
a line of its fix existed — one run, `5 failed | 615 passed (620)`, and one
more, `1 failed | 36 passed (37)`, on 2026-08-13.

| check                                                 | injected fault                                                                 | observed failure                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **the deploy gate** — `floorWordsOf` knows `capacity` | the `case 'capacity':` arm struck, so `default:` catches it again              | **both** tests of `the deploy gate: a plan a sized team is holding back` — `expected 'The chart cannot be drawn: slice seal…' to be null` and `no bar on the chart for sealing`, against four uncaught `GanttDataError: slice sealing::role-dev is held by capacity, which this chart has no words for`. The whole chart replaced by the fault boundary, on a plan be-01 schedules every day.      |
| a capacity floor names its display referent           | the throw replaced by `return 'Waits for a team'`                              | `throws when a capacity floor names no display referent` alone — `expected function to throw an error, but it didn't`                                                                                                                                                                                                                                                                              |
| a capacity floor carries a blocking set               | the throw deleted and the count clamped with `Math.max(0, n - 1)`              | `throws when a capacity floor says nothing was holding the pool` alone — `expected function to throw an error, but it didn't`                                                                                                                                                                                                                                                                      |
| a capacity-floored row names a team                   | the throw replaced by `poolNameOf(team) ?? 'its team'`                         | `throws when a capacity-floored row names no team to be short of` alone — `expected function to throw an error, but it didn't`                                                                                                                                                                                                                                                                     |
| the In-parallel column holds `999`                    | the declared width set to 24                                                   | `the In-parallel column holds three digits at the grid's own type` — `in-parallel declares 24px where "999" needs 30`. Chromium, h2puni.                                                                                                                                                                                                                                                           |
| the date columns still hold the day envelope          | `DATE_COLUMN_WIDTH` set to 94                                                  | `is as wide as the widest day the formatter can print` — `start declares 94px where the widest day it can print, "20 May 2027 ?", needs 95`. Chromium, h2puni.                                                                                                                                                                                                                                     |
| the In-parallel cell refuses a non-finite draft       | the `Number.isFinite` guard deleted                                            | `refuses a draft JSON cannot carry, rather than silently resetting the row` — `Unable to find an element with the text: /People at once is a whole number from 1 to 1000./`. The typed `1e999` sent as `null`, which is the reset.                                                                                                                                                                 |
| the export resolves inheritance over every row        | `teamsInForce` narrowed to `plan.rows.filter((r) => r.serviceTeamId !== null)` | `resolves the inherited label against every row of the plan` and `names the team a row inherits` — `expected '' to be 'Billing, Ltd (inherited from 010 Root)'`. Every inheriting row reported teamless.                                                                                                                                                                                           |
| the cards read the **effective** team                 | `teamLabel` pointed back at `teamLabelOf(row.serviceTeamId)`                   | `marks a team a row only inherits, and names where the label was written` — `expected undefined to be '↳ Billing'`. The inheriting card drew no team line at all.                                                                                                                                                                                                                                  |
| an emptied size box clears rather than zeroes         | the empty-box arm replaced by the plain `Number(typed)`                        | `clears to unstated when the box is emptied, rather than sending a zero` — `expected [ [ 't1', 4 ], [ 't1', +0 ] ] to deeply equal [ [ 't1', 4 ], [ 't1', null ] ]`. The page asking for a team of nobody.                                                                                                                                                                                         |
| the size draft survives the name's Escape             | the name's Escape pointed at the both-drafts `forgetDraft`                     | `keeps a half-typed size when the name beside it is escaped` — `expected '' to be '7'`                                                                                                                                                                                                                                                                                                             |
| **P2-1** a stale team label degrades, not throws      | `poolNameOf`'s `unresolved` arm returning `null` again (the shipped branch)    | two tests: `carries words for a team the directory read has not caught up with` — `GanttDataError: slice sand-dev is floored by a team's capacity but its row names no team` — and the panel's `still draws when the directory read has not caught up with the pool` — `expected 'The chart cannot be drawn: slice seal…' to be null`. The whole chart in the boundary for a skew that self-heals. |
| **P2-2** a refused parallelism reads as a sentence    | the `maxParallel_must_be_a_whole_number_from_1` entry struck                   | `says what a parallelism may be when be-01 refuses one` — `expected [ 'That change could not be completed (maxParallel_must_be_a_whole_number_from_1).' ] to include 'People at once is a whole number of 1…'`. The wire code in the corner of the screen.                                                                                                                                         |
| **P2-2** the ceiling is read out of be-01's own word  | the `PARALLELISM_CEILING_CODE` prefix arm deleted                              | `reads the ceiling out of be-01's own word for it` — `expected [ 'That change could not be completed (maxParallel_must_be_at_most_1000).' ] to include 'People at once is at most 1000.'`                                                                                                                                                                                                          |
| **P2-2** a parent's refusal says what happened        | the `has_children` entry struck                                                | `says why a parent's parallelism was refused, in the tree's words` — `expected [ 'That change could not be completed (has_children).' ] to include 'A row with work under it…'`                                                                                                                                                                                                                    |
| **P2-3** only the newest directory read writes        | no `latestRead` generation counter (the shipped branch)                        | `and only the newest read may write the screen` alone — `expected null not to be null`, at the assertion after the superseded read answers: the older response putting the name somebody had just changed back on the panel.                                                                                                                                                                       |

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
- **The directory read race is fixed and pinned, but not in a browser.** `and
only the newest read may write the screen` drives it in jsdom by holding two
  overlapping reads and answering them out of order. Two real overlapping HTTP
  responses are not what it exercises.
- **No screenshot was compared.** `layout.spec.ts`'s picture test writes its
  artefact; nobody looked at it. The In-parallel column is 32px of new furniture
  in a table Dany reads daily, and the eye that has to judge it is his.

## The 2026-08-13 cross-review

codex + agy + a driven verify against a private clone at `2e831ce`, written up
in the workspace as `notes/wbs-cross-review-2026-08-13-capacity-c3.md`. Verdict
**MERGEABLE-after**: no P1, three P2, eight P3. Both CLIs converged on the same
first finding independently, which had not happened before in this batch.

**Fixed here, each watched red first** — the five rows at the foot of the R5
table above:

- **P2-1** — `floorWordsOf`'s capacity arm threw the whole chart away on the one
  team state `ServiceTeamLabel` documents as _modeled_: `unresolved`, the stale
  directory lookup. Three of the four surfaces this change unifies degrade for
  it and only the chart threw. `poolNameOf` now gives it words — the cards' own
  — and keeps the throw for `none`, which is a genuine invariant break.
- **P2-2** — a refused In-parallel number put `maxParallel_must_be_a_whole_
number_from_1` in the corner of the screen. Three arms added:
  the floor, the ceiling as a **prefix** so the 1000 cannot drift from be-01's
  own, and `has_children`. The sibling size box got both of the first two a
  screen away in `wbs-api.ts`; this cell had neither, and nothing exercised the
  refusal path at all.
- **P2-3** — `directory-page.tsx`'s `read()` had no generation counter with
  three ungated call sites. Now `latestRead`, the project page's pattern. See
  `design.md`, "What this change does not do", for why the original deferral
  argument was wrong.

**Also fixed, one line each:** two `Proof:` comments in `gantt-panel.test.tsx`
credited `capacity-write-paths` as #52 (it is #53); `design.md` D3 and the R5
proof comment in `e2e/layout.spec.ts` both claimed a four-digit parallelism
cannot be stored, when C2 refuses `> 1000` and so `1000` is storable —
`table-frame.ts` said the true thing 200 lines away. The code was right in both
cases; only the record was wrong.

**Refuted:** agy's P2 that `LLM_README.md` is 151 lines and over its cap. It is
150, in the clone and in the worktree.

**Recorded and not applied** — six P3s, none of them a behaviour this change
introduces a regression in:

- `gantt-geometry.ts`'s blocking-set count reads `and 1 others` for a set of
  exactly two, and a test pins the string verbatim. User-visible copy, and the
  commonest non-trivial case.
- `ExportSlice` carries `effort` and `duration` that no consumer reads, under a
  docstring claiming all three do work. The information is not lost — `Total
days` and `Starts`/`Ends` carry it.
- `commitRename` calls the both-drafts `forgetDraft`, so committing a name drops
  an unsent size draft beside it. The Escape pair was introduced for exactly
  that asymmetry; the watched red covers Escape only.
- The chart never says the team's size clamped the number — the export can
  (`People at once` vs `Ran at`) and the cell's `title` hints at it. Outside the
  plan's §4.3 letter, which lists three sentences and not this one.
- The In-parallel cell's muted state is per-row (`doesEveryPhase`) where be-01's
  `widthFor` collapses per **slice**, so a leaf with two roles on two different
  people prints an un-muted number that does nothing. The chart gets it right
  per bar; the table and the cards do not. Reasoned, not executed.
- The over-bar `{team} ×{n}` label reaches every team-labelled plan, not only
  capacity ones: an estimated bar with nobody named previously wrote nothing.
  That is the plan's §4.3 letter, and it is the one visual change that lands on
  plans with nothing to do with capacity — the specific thing to look at when
  somebody finally compares a screenshot.

## Overlap with PR #56 (`change/unified-scroll-docking`, **merged** `66ef012`)

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

Whichever merges second rebases, and **#56 merged first** (`66ef012`,
2026-08-13). This branch was rebased onto it on 2026-08-13: all ten commits
replayed with **no conflict in any of the four files** — the prediction above
held — and the gate below is the run against the rebased tree, not against the
`2be2b25` base the earlier runs used. `gh pr view` reported MERGEABLE / CLEAN
both before and after.

## Plan versus reality

In `design.md`, one row per divergence, six of them. The two worth reading
before the diff: the In-parallel column is 32px rather than the plan's 48, paid
for out of the date columns' measured slack (D3); and the export gained two
columns rather than one, because width is decided per slice (D5).
