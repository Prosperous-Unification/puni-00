# verify — `filter-facets`

Branch `change/filter-facets`, cut from `origin/main` @ `2c29833` (#75 merged)
on 2026-08-17. **R10 F1** — the seven-facet filter of
`notes/wbs-brief-2026-08-17-r10-filtering.md` §7, built to the answers Dany
settled the same day (§9, `notes/decisions.md`).

**Run under the PoC-mode contract of 2026-08-14** (`notes/delivery-modes.md`).
No `design.md`, no citation table. New guards still get their injected fault —
six of them are below.

**This run had two halves and the first one died.** The agent that wrote most
of the code was killed mid-turn by its own harness (`FailoverError: Claude CLI
turn output exceeded limit` — an output-size failure, not a code one), leaving
six modified files, zero commits and **no local evidence of any kind**: nothing
had been typechecked, linted, formatted or run. The record below is the second
agent's, and every number in it was produced by that agent on h2puni.

## What the first half actually left

Read before trusting: the diff was coherent and mostly finished, but it was not
green and it was not complete.

1. **`optionsFor` was called twice and never defined** — the file did not
   typecheck. Written in this half (`wbs-table.tsx`), with the union against
   what is ticked that watched red 5 pins.
2. **Two table tests asked the rule-3 question through the wrong facet.** Both
   failed. `tick('Team Billing')` on a plan whose `010.1`/`010.2` inherit
   Billing keeps them on screen for a reason that has **nothing to do with rule
   3** — the team facet reads the _effective_ team (§8.5), so those rows answer
   the facet on their own account. Asked again through an **assignee**, which
   does not inherit, and the inheritance itself given the test it was missing
   (`keeps the rows that inherit a ticked team, which is not rule 3`).
3. **`leaves the Find box alone when the ticks are cleared` expected `['020']`**
   after clearing the facets — forgetting that with the ticks gone the filter is
   a typed name again, so rule 3 is back in force and `Paint` brings
   `020.1 Undercoat` with it. Now `['020', '020.1']`, which is the stronger
   assertion: it proves the restriction is per-render and not a latch.
4. **The one claim F1 rests on had no test**: that `shownRows` is the Gantt's
   own list, so a facet narrows the chart for free. A _name_ had that test since
   2026-08-09 (`gantt-panel.test.tsx`); a facet now has its own (watched red 6).
5. **Three lint errors and four unformatted files.** Two were checks that
   cannot fail — `no-unnecessary-condition` on a destructured-array guard and a
   `?? ''` on a `textContent` this repo types as `string`. The array guard was
   replaced by a `.find` and a throw that _can_ fire, rather than deleted.

## Wall clock

Second half only; the first half's is unrecoverable.

| moment                                               | UTC (2026-08-17) |
| ---------------------------------------------------- | ---------------- |
| worktree read, brief and modes read                  | 18:05            |
| `optionsFor` written, branch pushed, h2puni worktree | 18:15            |
| first full fe-01 run on h2puni — 2 failed            | 18:20            |
| both tests understood and rewritten — green          | 18:26            |
| six watched reds run and restored                    | 18:29            |
| record written, chart test added                     | 18:38            |
| lint/format fixed, full PoC gate green               | 18:46            |

**Split: ~15 minutes code and tests, ~20 minutes record, ~10 minutes watched
reds.** The single largest cost was neither: it was **reading the dead agent's
diff far enough to judge it** — about 15 minutes across six files, and it is
the cost `delivery-modes.md` already names ("understanding is the rest"). It
is also the cost that says something new: a resumed change is not a cheaper
change, because the second agent has to earn the same understanding the first
one had and cannot inherit it.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` plus
`bunx nx format:check --all`, on **h2puni**, bun **1.3.14**, in
`/home/puni1/wd/puni/wt-filter-facets` (a worktree of `/home/puni1/wbs-reds`).
Nothing was compiled or tested on h1claw (`bin/block-local-builds.sh`).

| run                                                     | result                               |
| ------------------------------------------------------- | ------------------------------------ |
| `nx affected -t test` (fe-01)                           | **53 files, 1451 tests, all passed** |
| `nx affected -t lint typecheck`                         | **Successfully ran** for fe-01       |
| `nx format:check --all`                                 | **clean**                            |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | **60 items, 60 passed, 0 failed**    |

**be-01, gw-01 and `libs/domain` are not affected**, which is the claim
`proposal.md` makes about the shape of this change: no migration, no route, no
wire field, and `schedule.ts` has an empty diff.

`openspec validate` was run locally on purpose. CI's `gate` job runs it
**unconditionally** and refuses a change with zero deltas — the PoC-mode local
contract never calls it, so a change can pass every local check and still go red
on first push. That finding is #73's, and this is the first change to act on it.

## The watched reds

Each fault was struck on h2puni, the affected suites run, and the strike
reverted with `git checkout --`. Counts are the exact run totals.

| #   | struck                                                                  | where                          | red                                 |
| --- | ----------------------------------------------------------------------- | ------------------------------ | ----------------------------------- |
| 1   | rule 3's facet guard → `if (true)`, so descendants always come          | `tree-search.ts` (the walk)    | **9 failed \| 520 passed (529)**    |
| 2   | `effectiveTeams.get(row.id)` → `row.teamIds`, the stored label          | `wbs-table.tsx` (`narrowable`) | **1 failed \| 449 passed (450)**    |
| 3   | `isFiltering` blind to facets — `\|\| anyFacetChosen(criteria)` removed | `tree-search.ts:142`           | **23 failed \| 506 passed (529)**   |
| 4   | the card's `data-match` → `undefined`                                   | `plan-cards.tsx:386`           | **2 failed \| 49 passed (51)**      |
| 5   | `optionsFor` returns `[...present]`, dropping what is ticked            | `wbs-table.tsx`                | **1 failed \| 449 passed (450)**    |
| 6   | the Gantt fed `table.getRowModel().rows` instead of `shownRows`         | `wbs-table.tsx:7111`           | **1 failed (the chart test alone)** |

Two of them earn their place by being **narrow**, which is the property this
repo keeps discovering it needs:

- **#2 fails exactly one test, and it is the one written for it.** The
  effective-vs-stored distinction has caused this class of bug twice here
  already, and a swap that reddens one test is a swap nothing else was watching.
- **#6 fails one test and nothing else.** Every other test in the file passes
  with the chart drawing rows the filter removed, which is precisely why "the
  chart narrows for free" needed an assertion rather than an argument.

#3's blast radius (23) is the honest shape of `isFiltering`: it is the one
answer to "is a filter on", read by the narrowing, the count, the empty-answer
sentence, the cards and the expansion controls. A second trim beside it would
have been a second answer to one question.

## What was deliberately not done

F2 (the filter control off the phone's sheet), F3 (the dropped-arrow count),
F4 (saved views) and F5 (the filtered export) are each their own change in the
brief's §7 ship order. **F1 alone hands somebody a filter that on a phone lives
inside a modal covering the plan it filters, and a chart that silently deletes
arrows** — that is §7's own sentence, it is still true at this head, and F1+F2
without F3 is the combination the brief says it would refuse to ship.
