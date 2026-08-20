# verify — `tags`

Branch `change/tags`, **rebased onto `main` @ `1d7751f`** (#86
`linked-row-hover`) on 2026-08-20. R10-B: a second label dimension beside the
team, built from R2-5's design with `service` renamed to `tag`.

Two tables, both apps, `libs/domain`, and one migration. The claim under all of
it is an **absence**: a tag is a label the scheduler never reads, so no date in
any plan may move because of one. That claim is asserted by a fault with its own
control, not by a file list — F9 below.

**Prod mode** (`notes/delivery-modes.md`): this adds `apps/be-01/drizzle/**`. The
PR ends at review, not merged.

## The rebase

The branch was cut at `9639a39` and `main` moved twice under it. It was rebased
**before** §7.3 was written rather than after, because #86 touches the chart and
writing the chart's tag reading against a five-commit-stale
`gantt-geometry.ts` would have been a conflict pretending to be a feature. The
rebase was clean — no content conflicts — and force-pushed with lease.

No migration-stamp collision: `20260819120000_add_tag` is still the latest
directory under `apps/be-01/drizzle/`, checked against every existing one. That
check is not ceremony — #60 and #61 both stamped `20260814100000`, and
`migrationsToRollback` filters on a strict `created_at >`, so `rollbackTo`
reversed nothing, silently, with both tables still standing.

## The gate

Run on **h2puni** over plain ssh at `798e218`, in
`/home/puni1/wd/puni/wt-tags`. Nothing was compiled or tested on h1claw; that box
denies both (`bin/block-local-builds.sh`).

| target                                                  | result                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | clean, exit 0                                                                                                                               |
| `bunx nx run-many -t lint typecheck --parallel=2`       | pass, **21 projects**, 42 tasks                                                                                                             |
| be-01 unit (bun **1.3.14**, in `apps/be-01`)            | **924 pass, 0 fail**, 27,396 `expect()` calls, 19.67s across **71 files**                                                                   |
| gw-01 unit (bun 1.3.14)                                 | **45 pass, 0 fail**, 8 files                                                                                                                |
| `libs/domain` unit (bun 1.3.14)                         | **89 pass, 0 fail**, 272 `expect()` calls, 7 files                                                                                          |
| fe-01 unit (`node vitest run`, node **24.18.1**)        | **1,532 pass across 53 files, 0 fail**, 61.93s                                                                                              |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | **69 items, 69 passed, 0 failed**                                                                                                           |
| secrets scan over every tracked file                    | exit 0                                                                                                                                      |
| `doc-caps`                                              | exit 0                                                                                                                                      |
| migration lint over every tracked `.sql`                | exit 0                                                                                                                                      |
| `bunx nx run-many -t build`                             | **not run here** — `tool-bootstrap` and `tool-devsync` refuse without `shellcheck`, absent on h2puni. CI runs it and is the gate of record. |
| fe-01 e2e (`pixels`)                                    | CI — see below.                                                                                                                             |

The bun version is quoted beside the counts deliberately: same tree, 1.2.20 and
1.3.14 print different `expect()` totals (#58's verify.md measured it both ways).
`nx run be-01:test` and `nx run fe-01:test` are **not** how the suites were run:
under bun on h2puni the fe-01 target runs zero tests and exits 0. be-01, gw-01 and
`libs/domain` are `bun test` in their own directories; fe-01 is
`node ../../node_modules/vitest/vitest.mjs run`.

**One caught-here false green worth the line it costs.** The first
`format:check` run reported `openspec/changes/tags/design.md` and I read
`FMT_EXIT=0` beside it — the exit code of the `tail` at the end of the pipe, not
of the check. `set -o pipefail` and a re-run gave the real answer: three
`*emphasis*` spans prettier writes as `_emphasis_`. Fixed, re-checked, exit 0 on
its own. The output named the file the whole time; the code beside it was the
lie.

One pre-existing warning survives: `react-hooks/exhaustive-deps` at
`wbs-table.tsx:3207` (`effectiveTags`), from §5, untouched here.

fe-01's suite is run through a config that needed a **fifth** alias for the
domain subpath — four tsconfigs and `vite.config.ts` were updated and
`vitest.config.ts` was not. Its own comment predicted that exact failure and it
happened anyway: **7 files failed to collect and 820 tests "passed"**. A
green-looking number beside a suite that had lost a seventh of itself. The file
count is the tell, not the colour, which is why 53 is printed above beside 1,532.

## The failure-proof table

R5: every check is watched failing with the thing it guards deliberately broken.
Each row names the fault, the test that saw it, and what the run printed. Each is
also recorded as a `Proof:` comment beside the line it belongs to, so the table
and the code cannot drift apart.

| #   | check                                                     | fault injected                                                                                 | what failed, and how                                                                                                                                                                                         |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `tag.name` is unique, so a rename can answer `taken`      | `CREATE UNIQUE INDEX` weakened to `CREATE INDEX` in `migration.sql`                            | **44 pass, 1 fail** in `migrate.test.ts`: the second row written instead of rejected — a directory holding two `regulatory` tags and a filter facet that has to pick one.                                    |
| 2   | `work_item_tag.work_item_id` cascades                     | `ON DELETE CASCADE` struck from `work_item_id`                                                 | **44 pass, 1 fail**, on that exact statement: `SQLiteError: FOREIGN KEY constraint failed` — every delete of a labelled work item answering 500 for the length of a swap.                                    |
| 3   | `work_item_tag.tag_id` cascades                           | `ON DELETE CASCADE` struck from `tag_id`                                                       | **44 pass, 1 fail**: `SQLiteError: FOREIGN KEY constraint failed` on the delete — `DELETE /api/tags/:id` answering 500 for every tag anybody has used, `?cascade=1` included.                                |
| 4   | the rollback drops what it added                          | `DROP TABLE IF EXISTS work_item_tag` struck from `down.sql`                                    | **32 pass, 13 fail**: the table still standing after a rollback that reported success — and the other twelve are the blast radius, every rollback in the file failing with `no such table: main.tag`.        |
| 5   | `effectiveTagsOf` reads tags, not the dimension beside it | `effectiveTagsOf` pointed at `row.teamIds`                                                     | `effective-tag.test.ts`: the tag half reading `['platform']` — a plan whose filter facet lists teams under the tag heading.                                                                                  |
| 6   | inheritance carries the **whole** set                     | `stated` → `stated.slice(0, 1)` in the shared walk                                             | `inherits an ancestor’s whole set, not its first member`: `expect(received).toEqual(expected)`, `- "platform"` missing from `[ "design", "platform" ]`. Watched over both dimensions.                        |
| 7   | the walk memoises the rows it walked                      | the memo write replaced by `walked.length;`                                                    | `resolves a chain of unlabelled rows once, and hands each of them the same answer`: `expect(received).toBe(expected)` — `Received: serializes to the same string`, two equal objects.                        |
| 8   | the ancestry cycle guard                                  | the guard replaced by `seen.size;`                                                             | `refuses a parent chain that runs in a circle` **never returns** — the run stops and the shell's own `timeout` kills it. A hang, not a red, which is why the assertion is on the throw.                      |
| 9   | **a tag moves no date** (the change's central claim)      | `effectiveTeamsOf(rows)` in `work-item.service.ts` fed rows whose `teamIds` are their `tagIds` | `tag-empty-diff.test.ts` **1 pass, 2 fail**: the dates case, because the rows land in a pool keyed on a tag id nothing sized, and **the control with it** — `serialises the two leaves while the team is …`. |
| 10  | a patch naming only tags is a write                       | the `tagIds` arm of the nothing-to-write guard removed                                         | all six cases of `a tag set is undone whole, which a scalar habit would not do` failed, first read `expected [ "…" ] to deeply equal []`. **A real bug, found this way, not by reading.**                    |
| 11  | the patch is journalled when it names only tags           | the `named.push('tags')` line deleted                                                          | `puts a replaced tag set back, whole` failed at its `expectDone` on `refused: stale_undo — “Strip the roof” has changed since then`: the undo reaching past a write that never journalled.                   |
| 12  | the journal's before-value is the **whole** prior set     | `out.tagIds = before.tagIds.slice(0, 1)`                                                       | **68 pass, 1 fail**: `expected [ "regulatory" ] to deeply equal [ "regulatory", "tech-debt" ]` — an undo that reports done and leaves one of the two labels on the row.                                      |
| 13  | the directory's tag row has no membership                 | a `count(…, 'member')` span copied into the tag row from the team row above it                 | `directory-page.test.tsx`: the `member` query finding two nodes where one was owed — a directory quietly claiming somebody belongs to `regulatory`.                                                          |
| 14  | the chart's hover text carries the tags                   | `tagWords(bar.tags)` deleted from `barFacts`                                                   | `1 failed \| 132 passed` in `gantt-panel.test.tsx`: `expected [ '010 - Strip', …(6) ] to include 'Tags Compliance, Rework'`.                                                                                 |
| 15  | the bar carries the row's real tags to the hover          | `tags: row.tags` → `tags: { state: 'none' }` in the bar literal                                | `2 failed \| 106 passed`: `expected { state: 'none' } to deeply equal { state: 'inherited', …(2) }`.                                                                                                         |
| 16  | the layout-invariance test can see a move at all          | (control, always on) one slice shifted by a workday                                            | the same whole-`GanttGeometry` comparison that says "tagged equals untagged" fails on the shifted plan — without it the invariance claim passes on a build that lays out nothing.                            |

**Two vacuous checks were found by running the injection rather than by reading
the code, and both are the same lesson twice.**

- **The first empty-diff test passed under its own fault.** It used
  `inMemoryCapacity()` with nothing seeded, so no pool existed, so no label
  decided anything. Rewritten against real SQLite and a real
  `CapacityRepository`, with a control that proves the plan's dates answer to a
  label at all; the fault then takes the control with it, which is #9's `2 fail`.
- **The memoisation test (#7) was first written in tree order** — shallowest
  first — and passed with the memo deleted, because every row is already in the
  map before anything walks through it. Deepest first, the fault is visible.

**One test was written at the wrong layer, caught, and moved.** The inheritance
assertion cannot live in `tree-search.test.ts`: `RowFacets` already holds the
effective reading, so the fixture stated the children's tags itself and the test
would have passed against a build reading stored labels everywhere. The walker's
tests assert OR/AND/empty only now, with a note saying why, and the inheritance
claim is made where the reading is computed (#5, #6).

## Three real bugs the tests caught, none of them by reading

1. **A patch naming only tags wrote nothing and answered `ok`.** The repository's
   nothing-to-write guard listed every patch field and not `tagIds`, so the patch
   took the early-return branch, wrote nothing, and returned the row it had
   found — every face reporting a successful write that never happened. #10.
2. **The wire type was lying.** `WorkItemView.tagIds` was declared required, but
   blue and green run together during a swap: an fe-01 carrying this change can be
   served a tree by the **outgoing** be-01, which has never heard of the field,
   and every card threw `Cannot read properties of undefined`. Now optional on the
   wire, defaulted once in `toTree`, required on `TreeRow`. Lint forced the honest
   version — it rejected the `?? []` as unnecessary _because the type claimed the
   field was always there_.
3. **A saved view stored before this change crashed the panel.** #83 shipped saved
   views on 2026-08-19; a view saved between then and now has no `tagIds` and
   `filterWords` threw. Requiring the field would have made
   `rememberedSavedViews` **delete** those views — the tool binning somebody's
   filters because a feature they never asked for shipped. A facet added later
   reads as absent, normalised through `NO_FILTER` at the storage boundary.

## CI

**Run 32404008038** at `310de48`, PR #87.

| job      | conclusion  | what it carried                                                                                                                        |
| -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `gate`   | **success** | 4m6s. format, the whole run-many target, secrets scan, doc caps, compose files, migration lint, and `build` — which h2puni cannot run. |
| `pixels` | **fail**    | `1 failed / 179 passed`, 9.6m. Reran `--failed`: **the same one test, the same numbers**, 9.7m.                                        |

The failure is `dark-mode.spec.ts:263`, `follows the machine while nothing has
been chosen, and stops when something is`, failing inside its `settled()` helper
on `expect(document.getAnimations().length).toBe(0)` — `Expected: 0 / Received:
12`, `Timeout 10000ms exceeded while waiting on the predicate`.

**It is not this branch's, and the identical rerun is what says so.** This repo's
record has a real `pixels` flake class — `dark-mode` amid a wall of
`write EPIPE` / `read ECONNRESET`, seen at #44, #57 and `team-sets` — and that
wall is present here too, which is exactly why the rerun mattered. A flake moves.
This did not: same test, same `12`, twice.

So the question is whether `main` has it, and it does:

- **`main` @ `1d7751f`** (the base this branch is rebased onto, #86 merged),
  run **32360096281**: `pixels` fails on `dark-mode.spec.ts:263`,
  `Expected: 0 / Received: 12`, `1 failed / 179 passed`. Identical.
- **`main` @ `9639a39`**, run **32281560107**: the same test failing the same way,
  alongside a second one (`header.spec.ts:440`).

The red therefore predates this change by at least a day, and #86 was merged over
it. This branch adds no animation and no transition — `git diff origin/main...HEAD
-- apps/fe-01/src` matches nothing on `animate-`, `transition`, `duration-` or
`animation`. Twelve animations that never drain on a page whose theme flipped is
`main`'s bug to name, and it is called out to the reviewer rather than absorbed
here: **`main` is red, and a green `pixels` is not available to any branch cut
from it until that is fixed.**

`gate` is green at the head, and it is the job that carries `build`, which
h2puni cannot run.

## Deviations, named rather than implied

- **No `wbs-api` spec delta.** `tasks.md` §8.3 asked for one. There is no
  `wbs-api` capability in this repo: 66 of 68 change folders put their delta in
  `wbs-domain`, `directory-crud` included, and that change shipped the directory
  routes and their 409 shapes as `wbs-domain` requirements. Both halves are stated
  there. Design D10.
- **The table-width budget is exempted for the tag column.** The folded table has
  29px of slack at 1280 (measured 2026-08-14, `layout.spec.ts`) and the column
  costs 120. `CONDITIONAL_COLUMNS` keeps `tag` out of `FIXED_COLUMNS`, so
  `foldedTableMinWidth` answers exactly the number it did before this change, and
  the column renders only where the deployment has a tag vocabulary. Design D7.
- **`libs/domain` does not have an empty diff and the proposal was corrected
  rather than the claim quietly narrowed.** The scheduling surface does. Design
  D3.

## What this change deliberately does not prove

- **Baseline counts were not re-measured on `main` in this chunk.** The numbers
  above are this branch's, measured at `798e218`; the per-section deltas are in
  the LLM_README record as each section landed. What is verified here is the head,
  not the arithmetic between it and `main`.
- **No browser has seen the tag column, the card chip or the directory section.**
  `pixels` is the only thing that can, and it runs in CI and nowhere else.
- **The conditional column is invisible to a deployment with no tags**, which is
  the point of D7 and also means its own unit tests are the only thing that
  renders it.
- **Nobody has deployed it.** Dev still serves `main`.

## The record of what was run

Every command above ran on h2puni in `/home/puni1/wd/puni/wt-tags`, a worktree of
`/home/puni1/wbs-reds`, at `798e218`. `/tmp` was at **19%** before the run — read
`df -h /tmp` on that box before reading a diff, because a full tmpfs there
reported `545 pass / 170 fail` and 196 `SQLiteError: disk I/O error` on a green
tree once already (#61's verify.md). The injections were applied against the
working tree and reverted with `git checkout <file>` immediately after each run;
`git status` is clean at the head this PR carries.
