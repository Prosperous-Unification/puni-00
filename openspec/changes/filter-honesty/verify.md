# verify — `filter-honesty`

Branch `change/filter-honesty`, cut from `origin/main` @ `6a83863` (#76 and #77 merged) on 2026-08-17. **R10 F3 + F5** of `notes/wbs-brief-2026-08-17-r10-filtering.md` §7, built to the eight answers Dany settled the same day (§9, `notes/decisions.md`).

**PoC mode** (`notes/delivery-modes.md`): no `design.md`, no citation table, no R5 fault table. New guards still get their injected fault — five are below. One change folder for the theme rather than one per sub-item, which is the amendment adopted 2026-08-17.

## Wall clock

| moment                                                       | UTC (2026-08-17) |
| ------------------------------------------------------------ | ---------------- |
| brief, decisions, delivery modes and F1's own record read    | 19:32            |
| branch cut from `origin/main` @ `6a83863`                    | 19:32            |
| F3 written (geometry counts, panel sentence, widened edges)  | 19:38            |
| F5 written (`filterWords`, `scope`, the fifth button)        | 19:41            |
| tests written across five files, first h2puni run — 4 failed | 19:43            |
| all suites green (1478 tests)                                | 19:45            |
| five watched reds run and reverted                           | 19:52            |
| record written, gate and `openspec validate` green, PR open  | 19:58            |

**Split: ~9 minutes code, ~12 minutes tests, ~7 minutes watched reds, ~10 minutes record.** The largest single cost was again the reading — about 20 minutes before the first edit, across `tree-search.ts`, three seams of `wbs-table.tsx`, `gantt-geometry.ts`'s three drop sites and both writers. `delivery-modes.md` predicts exactly this ("understanding is the rest"), and F1's own record says the same thing from the other side.

**What the lighter contract made me uncomfortable about:** nothing in the code, one thing in the split. F3 and F5 share a theme but not a seam — the chart's sentence and the export's header line touch no common function — so the one folder buys the amortised reading and nothing else. If this had gone red on CI it would have been two changes to bisect, not one.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` plus `bunx nx format:check --all`, on **h2puni**, bun **1.3.14** (the version CI pins), in `/home/puni1/wd/puni/wt-filter-honesty` — a worktree of `/home/puni1/wbs-reds`. Nothing was built or run on h1claw (`bin/block-local-builds.sh`).

| run                                              | result                               |
| ------------------------------------------------ | ------------------------------------ |
| `nx affected -t test` (fe-01)                    | **53 files, 1478 tests, all passed** |
| `nx affected -t lint typecheck`                  | **Successfully ran** for fe-01       |
| `nx format:check --all`                          | **clean, exit 0**                    |
| `bunx @fission-ai/openspec@1.3.0 validate --all` | **62 items, 62 passed, 0 failed**    |

**CI is the gate of record**: run [`32063236214`](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/32063236214) at head `66f2ec0` — `gate` **success**, `pixels` **success**, first attempt, 9m37s. PR #78, open and not merged.

F1 left 1451 tests; this change adds 27. **be-01, gw-01 and `libs/domain` are not affected** — no migration, no route, no wire field, and `schedule.ts` has an empty diff. `openspec validate` was run locally on purpose: CI's `gate` job runs it unconditionally and refuses a change with zero deltas (#73's finding).

## The watched reds

Each fault was struck on h2puni, the affected suites run, and the strike reverted with `git checkout --`. Counts are the exact run totals.

| #   | struck                                                                      | where               | red                                                                                        |
| --- | --------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| 1   | the one-end guard at all three drop sites → an unconditional `+= 1`         | `gantt-geometry.ts` | **1 failed \| 214 passed** (`counts nothing for a link with neither end on screen`, alone) |
| 2   | `plan.narrowedByFilter &&` dropped, so the sentence renders whenever it can | `gantt-panel.tsx`   | **1 failed \| 569 passed** (`says nothing while the filter is off…`)                       |
| 3   | `dependencies` back to `shownRows`' own edges                               | `wbs-table.tsx`     | **1 failed \| 454 passed** (`counts the wait that leaves a shown row for a hidden one`)    |
| 4   | `planToMermaidDocument`'s scope guard → the whole-plan `Scope` line always  | `plan-mermaid.ts`   | **1 failed \| 48 passed** (`expected … not to contain '**Scope:** the whole plan…'`)       |
| 5   | the `Scope` field never pushed into the header block                        | `plan-export.ts`    | **8 failed \| 548 passed** across three files                                              |

Three of them earn their place by being **narrow**:

- **#1 fails one test out of 215.** Every other assertion about the chart passes while a wait between two hidden rows is counted, which is exactly why "only where one end is drawn" needed a test rather than a sentence.
- **#2 fails one test out of 570.** The sentence renders correctly under a filter either way; what breaks is the collapse-only case, which is the whole of the decision.
- **#3 fails one test out of 455.** The old list drew the same arrows and counted the same drops in one direction, so nothing else in the suite can see the difference — the successor-hidden edge is the one thing that can.

#5's blast radius (8) is the honest shape of a header field: the Markdown sentence, the CSV copy of it, the holes count, the collapsed-branch wording and the table's own download all read one function.

## What was deliberately not done

- **The dependency closure is not pulled back** (Q7). Nothing new is drawn anywhere; F3 buys a sentence.
- **A collapse alone still says nothing.** The rows are narrowed by a triangle that is on screen beside the row, which is the momentary act this repo has always treated it as. Under a saved view (F4) that judgement is worth re-taking, since a stored narrowing is no longer momentary.
- **The on-screen export is Markdown only** — no CSV and no clipboard variant, and it is a table rather than the bundled Mermaid document: the bundle refuses when nothing is placed, and a filter narrowed to parent rows places nothing, so it would refuse exactly where a reader wants their rows.
- **F2** (the filter control off the phone's sheet) and **F4** (saved views) are untouched. F2 is now the last piece of the brief's own ship point — F1 + F2 + F3 — and this change closes the half of it the brief said it would refuse to ship without.
