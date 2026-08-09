# X `live-editing-extraction` — verify

Every command below was run on 2026-08-09 on Dany's Mac (darwin arm64, bun
1.3.14, chromium from the Playwright cache), from the worktree at
`.claude/worktrees/agent-ad677483c2310b1ea` on branch
`change/live-editing-extraction`, cut from `change/phases-ui` (head `ef5210c`)
with `change/uiux-findings-fixes` (head `79e673f`) merged into it.

## The merge

One textual conflict, in `AGENTS.md`: both branches wrote a paragraph dated
2026-08-09 into the R5 tally, and git could not interleave them. Both survive.
`uiux`'s is the **fourteenth** check that could not fail — the `actions-menu`
guard that refused a modified Enter without `preventDefault`, found by driving
real Chrome by hand — and it also carried the `thirteen → fourteen` edit in
`LLM_README.md`, which merged cleanly. `phases-ui`'s two are named as **not
shipped**, and their sentence "which is why the tally is still thirteen" became
"which is why neither is in the count above", because the count above them had
moved for a reason that has nothing to do with them.

`wbs-table.tsx` and `wbs-table.test.tsx` auto-merged. Every Proof comment from
both sides is in the file: `focusIntentIsStale`/`commandFrom` from `uiux`, and
`settleAgainstRoles`' two from `phases-ui`, checked by name.

**One semantic conflict the merge could not see.** `phases-ui`'s
`keeps a draft be-01 refused when a new phase rebuilds every column` asserted
the toast said `forbidden`; `uiux` is the change that stopped a refusal reaching
the corner of the screen as a snake_case code. It now asks for
`That change could not be completed: this plan is not yours to change.`, which
is what the other fourteen assertions on that sentence ask for. Nothing else in
the test moved — the subject is still that the draft survives the rebuild.

That was found by running the suite, not by reading the diff: 691 passed and one
failed on `expected [ Array(1) ] to include 'forbidden'`.

## What landed

| file                                       | what                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `src/components/wbs/editable-grid.ts`      | new — the grid, found by `[data-grid]`, and everything that walks it    |
| `src/components/wbs/live-editing.ts`       | new — `LiveField`, the held refusals, the flush registry, `FocusIntent` |
| `src/components/wbs/live-editing.test.tsx` | new — 4 tests, two faces of one field                                   |
| `src/components/wbs/cell-input.tsx`        | 542 → 213 lines; what is left is about an `<input>`                     |
| `src/components/wbs/wbs-table.tsx`         | the grid helpers, the two focus refs and `focusIntentIsStale` all leave |
| `src/components/wbs/wbs-table.test.tsx`    | one assertion, from the merge above. No test edited for the refactor.   |

`e2e/*` untouched. `AGENTS.md` and `LLM_README.md` carry the merge only.

## The gate

| command                                                         | result                   |
| --------------------------------------------------------------- | ------------------------ |
| `bunx nx format:check --all`                                    | pass                     |
| `bunx nx run-many -t test lint typecheck build --parallel=2`    | pass, 21 projects        |
| `bunx nx test fe-01`                                            | **696 passed**, 33 files |
| `bunx openspec validate --all --json`                           | pass                     |
| `bunx playwright test --config apps/fe-01/playwright.config.ts` | **49 passed**, 53.8s     |

The browser ran on 3109/3209/4209 — this agent's own — through a temporary edit
to `playwright.config.ts` and the three gitignored `.env` files, both reverted
after the run. The specs themselves are byte-identical to the merged branch:
`git diff change/uiux-findings-fixes HEAD -- apps/fe-01/e2e/` is empty.

49 rather than the plan's 47: `uiux` brings two more `keyboard.spec.ts` tests,
one of them the browser negative for the fourteenth check. Nothing here added
or edited a browser test.

fe-01 counted 692 before this change (684 on `phases-ui`, 8 from `uiux`) and
696 after — the four new ones are all in `live-editing.test.tsx`.

## Failure proof

Every check this change moved was watched failing where it now stands, and the
one check it adds was watched failing twice.

| check                                         | fault injected                                                 | what failed                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GRID_SELECTOR` = `[data-grid]`               | pointed at `[data-grid-that-is-not-there]`                     | **26** — every Tab, every arrow between cells, `steps over the date cell until the plan is on a calendar`, Cmd+Enter |
| the held refusal is keyed on the cell         | the hold moved back inside the face, as a field of `LiveField` | **3** — two in `live-editing.test.tsx`, plus `keeps a draft be-01 refused when a new phase rebuilds every column`    |
| the restore does not care what draws the cell | restore gated on `node.closest('table') !== null`              | **1** — `carries a refused draft from one renderer to the next`, and only it: 695 others passed                      |
| `FocusIntent.isStale`                         | forced to `false`                                              | **1** — `a late create does not take the focus back off a cell somebody moved to`                                    |

The third row is the one worth reading. It is the fault this change exists to
prevent, and every other test in the repository is blind to it, because every
other test renders the grid as a table. A refactor whose only proof is "the old
tests still pass" cannot see the thing it was done for.

## Two things named rather than changed

Neither is a bug on `main`. Both are behaviour that today gets away with living
where it lives, and both would have been easy to change silently while moving
the code past them.

### 1. A face inherits the held refusal and nothing else

`LiveField` now holds `shown`, `typedHere`, `sent` and `latest` in one object,
and that object is constructed once per mount. It would be one line to keep it
in the module map instead, so a second renderer inherited the whole field. That
line is **not** written, and the class says so:

- **`sent` across a remount** is rule 5. Today a remount forgets the submission
  record, so leaving the cell again re-sends. Preserving it would make the
  second leave return the in-flight promise instead — arguably the better
  behaviour, and a change no test in this repository can see.
- **`shown` across a remount** is the baseline a composite cell diffs against.
  In the refused case it equals the server value either way; in the case where
  a peer's edit was held back by rule 2 _and_ the columns then rebuilt, the two
  readings differ in which text the Name cell's notes are diffed against.

Both are `M mobile-cards`' question to ask with a rotate in front of it, not a
side effect of moving a file.

### 2. The estimate drafts stayed in `WbsTable`

`drafts`, keyed `rowId::roleId::point`, is React **state**: every keystroke in a
folded trio re-renders the table, and `settleAgainstRoles` prunes it. It is
named in the plan alongside the refused holds, and it is a different animal —
it feeds what is rendered rather than what is committed, and moving it out of
state would change when the table re-renders, which is a behaviour change
wearing a refactor's clothes. `M` renders the same cells and can read the same
state; if it needs them outside React, that is its change.
