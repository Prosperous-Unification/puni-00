# verify — `table-width-budget`

Branch `change/table-width-budget`, cut from `main` @ `203a85b` (#61 team-sets
merged) on 2026-08-14 and **rebased onto `main` @ `60172be`** the same day when
#60 (priority-bands) landed under it. PR #62.

fe-01 only, and two of the three findings it answers are answered by
**measurement rather than by code**: the change's largest single output is that
the regression's P2 does not exist and now cannot be re-reported, because a
browser watches the boundary it was about.

## The rebase

#60 merged while this branch was open and touches two of this branch's six
files — `wbs-table.tsx` and `wbs-table.test.tsx`. `git rebase origin/main`
replayed the one commit with **no conflict**: #60's work is the priority ladder
(`libs/domain/priority-band.ts`, the write path, four cell faces) and this
branch's is the Depends on cell's hover, and they do not touch the same regions.

Three numbers below move because main moved, and none of them is this change's:
be-01 715 → **739** (#60's ladder table, its seeding and its migration),
`libs/domain` 49 → **65**, fe-01 1,308 → **1,340** across 50 → **52** files, and
openspec 46 → **47** (#60's own change folder). fe-01's own two are still this
branch's two.

The gate below was re-run **after** the rebase, at `f22fb5f`, and is the record.

## The gate

Run on **h2puni** over plain ssh at the rebased head `f22fb5f`, in
`/home/puni1/wd/puni/wt-table-width`, a worktree of `/home/puni1/wbs-reds`.
Nothing was compiled or tested on h1claw; that box denies both
(`bin/block-local-builds.sh`), and it denied two of the commands written for this
change on the way — a `gh pr create` whose body quoted the compile target, and a
`grep` over a CI log that named it. The guard reads the whole command string,
heredoc text included, which is landmine 4 in the workspace's own notes.

| target                                                  | result                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | clean, exit 0                                                                                                                               |
| `bunx nx run-many -t lint typecheck --parallel=2`       | pass, **21 projects**, 42 tasks                                                                                                             |
| be-01 unit (bun **1.3.14**, in `apps/be-01`)            | **739 pass, 0 fail**, 25,078 `expect()` calls, 15.97s across **61 files**                                                                   |
| gw-01 unit (bun 1.3.14)                                 | **45 pass, 0 fail**, 8 files                                                                                                                |
| `libs/domain` unit (bun 1.3.14)                         | **65 pass, 0 fail**, 4 files                                                                                                                |
| fe-01 unit (`node vitest run`, node 22.14.0)            | **1,340 pass across 52 files, 0 fail**, 58.77s                                                                                              |
| fe-01 e2e (`bun run e2e`, Playwright image on h2puni)   | **172 passed, 0 failed**, 6.7m — one real chromium against the three-app stack                                                              |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | **47 items, 47 passed, 0 failed**                                                                                                           |
| secrets scan over every tracked file                    | exit 0                                                                                                                                      |
| `doc-caps`                                              | exit 0                                                                                                                                      |
| migration lint over every tracked `.sql`                | exit 0                                                                                                                                      |
| `bunx nx run-many -t build`                             | **not run here** — `tool-bootstrap` and `tool-devsync` refuse without `shellcheck`, absent on h2puni. CI runs it and is the gate of record. |

The bun version is quoted beside the `expect()` count deliberately: same tree,
1.2.20 and 1.3.14 print different totals (#58's verify.md measured it both ways).

fe-01 goes 1,338 → **1,340**, and both are this branch's: the jsdom case that
says where the Depends on hover lives, and the second phases-dialog case that
keeps the plural. The browser suite goes 169 → **172**: one in `layout.spec.ts`
and two in `deps-cell.spec.ts`.

`nx run fe-01:test` is **not** how the fe-01 suite was run: under bun on h2puni
that target runs zero tests and exits 0. be-01, gw-01 and `libs/domain` are
`bun test` in their own directories; fe-01 is
`node ../../node_modules/vitest/vitest.mjs run` with node 22 on `PATH`, and the
browser suite is `playwright test` inside
`mcr.microsoft.com/playwright:v1.62.1-noble` (h2puni has no sudo for
`playwright install-deps`).

## CI

**Run 31802343909, `conclusion: success`, first attempt, no flake.** PR #62,
head `f22fb5f2cc92b51560a71ad9440f0354ae9cffc9` (`f22fb5f`) — the rebased head,
and the tree this PR merges. 12:54:37 → 13:04:22Z.

| job      | conclusion  | what it carried                                                                                                                                                                                                                                                                                |
| -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gate`   | **success** | format, the whole run-many target, secrets scan, doc caps, compose files, migration lint. be-01 **739 pass** / 25,078 `expect()` across 61 files, gw-01 **45**, `libs/domain` **65**, fe-01 under `bunx vitest run` inside the same target. OpenSpec **47 passed / 0 failed**. bun **1.3.14**. |
| `pixels` | **success** | `bun run e2e`, one real chromium against the three-app stack: **172 passed**, 8.2m.                                                                                                                                                                                                            |

`build` runs in that job and only there: h2puni has no `shellcheck`, so
`tool-bootstrap` and `tool-devsync` refuse it. CI is the gate of record for it,
and it is green.

**One earlier run, and it is `cancelled` rather than failed.** 31802279014 at
`98e5bb8` — this branch's pre-rebase head — was cancelled 64 seconds in by the
workflow's concurrency group when the rebased head was force-pushed over it.
Nothing failed in it.

**Worth recording because it is the base this branch was cut from:** `main`'s own
run at `203a85b`, **31798654373, `failure`** — `gate` green, `pixels` red with
**2 failed / 167 passed** on `dark-mode.spec.ts`'s "is dark before the app has
mounted" and `name-cell.spec.ts`'s "…is whole once it is left", amid a wall of
`[vite] ws proxy error: write EPIPE` and `write ECONNRESET`. That is the same
ECONNRESET class this repo has now recorded five times — #44's `f8b7d62`, #57's
31682877355, and #61's 31786930904 twice. It is not this branch's, and the same
two specs passed 172/172 here in both CI and on h2puni.

## The failure-proof table

R5: every check here was watched failing with the thing it guards deliberately
broken. Each row names the fault, the test that saw it, and what the run
printed. All seven were watched on **2026-08-14** on h2puni — the jsdom ones
under node 22 vitest, the browser ones in the Playwright image.

| #   | check                                              | fault injected                                                                         | what failed, and how                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | the declared `width` is the **cap**, not the floor | `tableWidthStyle`'s `width` arm fed `layout.minWidth` instead of `layout.maxWidth`     | `holds the folded budget at 1280, and says where it stops`: `the declared width is the cap, not the floor` — `Expected: "min(100%, 1439px)" / Received: "min(100%, 1219px)"`. Every scroll assertion in it stayed green.                                                                                    |
| F2  | the folded budget really is intact at 1280         | `['in-parallel', 32]` → **64**, i.e. the budget genuinely blown                        | the same case: `two folded phases fit a 1280 laptop: expected 1251 to be less than or equal to 1248`. **At `48` (+16) it passes** — watched — which is how the 29px of slack was measured rather than asserted.                                                                                             |
| F3  | the cell-level dependency hover is on the `<td>`   | the enter and the leave put back on the wrapper `<span>`, exactly as on `main@203a85b` | `lights the whole set from a crowded cell at its default width`: `the plan is still lit with the pointer off the table — - Expected - 1 / + Received + 4`, at the reset. The **leave** shows first: inside the cell it never puts the fixture's light out. 1 failed / 1 passed.                             |
| F0  | the same, deleted rather than moved                | the `<td>` spread removed and nothing put back                                         | both cases in that block failed on the same message. Included because it is what caught the vacuity below.                                                                                                                                                                                                  |
| F4  | the pill's narrower reading survives the move      | the pill's own `onMouseEnter` deleted                                                  | `narrows to one pill when the pointer settles on it, from the cell`: `toEqual(['040'])` with `- Expected - 0 / + Received + 1` — the cell's whole set standing where the pill's one row should be. 1 failed / 1 passed.                                                                                     |
| F7  | the jsdom half: which element carries the handlers | the same swap as F3, with `hoverTargetOf` already pointing at the `<td>`               | **six** cases in `hovering a dependency lights the rows it names` failed together, the first on `expected [] to deeply equal [ '010', '020' ]`, and one of them on `Unable to find an accessible element with the role "tooltip"` — the card's half of the same handler. 6 failed / 3 passed / 418 skipped. |
| F5  | the width sentence's verb, singular arm            | the verb put back to a flat `need`                                                     | `counts one phase as one, and says so in the singular throughout`: `expected 'PhasesPhasesThe phases every work ite…' to contain '1 phase needs ≥1123px of width to sit…'`. 1 failed / 1 passed.                                                                                                            |
| F6  | the width sentence's verb, plural arm              | the plural arm made to say `needs` as well                                             | `keeps the plural where there is more than one phase`: `… to contain '2 phases need ≥1219px of width to sit…'`. 1 failed / 27 skipped. Without this row the fix could have been "never say `need`".                                                                                                         |

**One vacuous check was found, and it was found by running the injection rather
than by reading the code.** `lights the whole set from a crowded cell at its
default width` was first written without `pointerAwayFromTheTable`, and it
**passed with the cell-level handler deleted outright** (F0). Seeding the
fixture drives a real pointer across the cell — the picker is clicked, pills
appear under it, and a pill's own `mouseleave` widens the light back to the cell
"because the pointer is still in the cell" — so the plan arrives at the test
already lit and every assertion read a light the test had not produced. The
reset moves the pointer off the table and **asserts the dark state**, which is
the leave as well as the enter. R5's own rule, one more time.

**One reasoning step is named rather than watched**, and it is the one the move
turns on: `mouseenter` fires on every element being entered, outermost first, so
a pointer arriving straight onto a pill runs the cell's handler and then the
pill's. jsdom cannot say so — `fireEvent.mouseEnter` dispatches to one element
and simulates no chain — so the jsdom case asserts only the direction that **is**
discriminating (entering the `<td>` cannot reach a handler on the wrapper inside
it) and the browser case F4 guards the ordering.

## The three findings, against what was measured

### 1 — the P2 does not exist

`design.md` D1 has the argument; the numbers are these, watched at 1280×800 in
Chromium, on a plan no row of which sets an earliest start:

| folded phases | `style.min-width` | `style.width`       | table laid out | frame client | frame scroll | scrolls? |
| ------------- | ----------------- | ------------------- | -------------- | ------------ | ------------ | -------- |
| one           | **1123px**        | `min(100%, 1343px)` | 1248           | 1248         | 1248         | no       |
| two           | **1219px**        | `min(100%, 1439px)` | 1248           | 1248         | 1248         | no       |
| three         | **1315px**        | `min(100%, 1535px)` | 1315           | 1248         | 1315         | **yes**  |

1343 / 1439 / 1535 are the table's `width` — the sum with Name at
`FLEXIBLE_CAP`, where it stops growing. D14's recorded **1219px is exact,
unchanged, and is the two-phase figure**. **No column moves in this change**, and
every figure above is the figure at `main` as well as after it.

The slack is **29px** at two folded phases, and F2 is how that was established
rather than computed: +16px on a fixed column leaves the budget intact and +32px
breaks it.

### 2 — the depth-5 Number cell: recorded, not fixed

Reproduced to the digit — content right **135.0625** against a cell right of
**133**, `scrollWidth` **99** against `clientWidth` **93**, depth 4 fitting with
7.13px to spare. The overflow is the column's recorded bargain
(`NUMBER_ENVELOPE` is two levels) and two existing browser cases already assert
the clip and the `title`.

Measuring what the cell **draws**, character by character through a `Range`,
found what the report did not:

| row             | drawn        |
| --------------- | ------------ |
| `010.1.1.1`     | `010.1.1.1`  |
| `010.1.1.1.1`   | `010.1.1.1.` |
| `010.1.1.1.1.1` | `010.1.1.1.` |

A row and its child read as the same number — the fault the 2026-08-12 UI audit
reported at depth 4 and `table-mechanics` fixed, one level along. It also means
the depth-4 case's guarantee is bought by a single `.`.

Nothing here fixes it, and `design.md` D4 has the cost of each candidate:
widening buys one level (93 → 105, affordable — two folded phases would be 1231
against 1248) and moves the break to 6/7; an ellipsis leaves 5 and 6 reading
alike; eliding from the **head** is the only one that holds at every depth and
inverts how every clipped number in the product reads, besides turning
`the Number column fits its envelope` into a check that cannot fail unless its
helper is rewritten. **Open, with Dany.**

### 3 — the Depends on cell

`design.md` D2 has the geometry. The report's "unreachable" is measured as
"reachable on 17.8px of a 110px cell" — the add button — with the cell's own
padding answering nothing. The handlers are on the `<td>` now. What is still not
there at that width is an empty **input box**: it needs +34px of column (which
would spend the 29px of slack finding 1 just measured) or shrinking pills, and
both are recorded as Dany's call rather than taken.

## What this change deliberately does not prove

- **No column width changed, so no width claim is re-measured.** The envelope
  cases, the pinned offsets and the date envelope all still stand on the runs
  they were written against.
- **Nobody has deployed it.** Dev still serves `main`. The one runtime change is
  where two handlers are attached and one word in a dialog; there is no
  migration, no wire change and no route.
- **Nobody has moved a real pointer by hand.** Chromium moved every pointer in
  this record. The gesture B4 describes has been watched, in that browser, at
  the width the manual suite could not reach — but the manual suite's own case
  is still owed a run on dev.
- **The width figures are for an undated plan.** With a row dated, `not-before`
  goes 56 → 84 and every figure in the table above rises 28px: two folded phases
  become 1247 against 1248, which is the one-pixel margin D14's older wording
  was about. Watched only in the undated state.

## The record of what was run

Every command above ran on h2puni in `/home/puni1/wd/puni/wt-table-width`, a
worktree of `/home/puni1/wbs-reds`, at `f22fb5f`. The injections were applied
with `python3` against the working tree and reverted immediately after each run;
`git status` is clean at the head this PR carries. `/tmp` on that box stood at
7% throughout, so none of the bulk `SQLiteError: disk I/O error` failures #61
recorded could have been in play — and `TMPDIR=/var/tmp` is set in that host's
`~/.bashrc`, so the test databases were never on the tmpfs at all.
