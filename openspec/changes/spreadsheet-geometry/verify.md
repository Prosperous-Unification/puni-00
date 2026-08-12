# Verification

Everything below was run for this change. Nothing is quoted from another
change's run.

## Where things ran

This box (`h1claw`) runs no test suite and no build — Dany's rule, enforced by a
`PreToolUse` hook. Two places did the work:

- **h2puni**, a worktree of this branch at `~/wd/puni/wt-table-polish`: the unit
  suite under a real node (`node node_modules/vitest/vitest.mjs run …`, via
  `~/tp-unit.sh`), and the browser gate in the official Playwright image
  (`~/tp-e2e.sh`, the rig `table-geometry-and-tab-order` left behind). Both
  scripts are copies of `table-mechanics`' with the path repointed; neither is
  committed.
- **CI**, `gh workflow run ci.yml`: the whole gate plus the `pixels` job.

The landmine that rig exists for is unchanged: `bunx vitest` under bun on h2puni
dies in its own worker bootstrap and `nx run fe-01:test` wraps it and exits 0, so
a green `run-many -t test` on that host says nothing about fe-01.

## The gate

| command                                           | where  | result                                |
| ------------------------------------------------- | ------ | ------------------------------------- |
| `bunx nx format:check --all`                      | h2puni | green (silent), 2026-08-12            |
| `bunx nx run-many -t lint typecheck --parallel=2` | h2puni | green, 21 projects                    |
| fe-01 unit suite under node                       | h2puni | **48 files, 1208 passed**             |
| `bun run e2e` (whole suite)                       | h2puni | 160 passed — see the two flakes below |
| the whole gate                                    | CI     | **green**, run 31619178851            |
| `bun run e2e` (`pixels`)                          | CI     | **green**, 160 passed (6.8m)          |
| `openspec validate --all --json`                  | CI     | **green**, 37/37                      |

CI ran at head `f4f0779`: the gate job green — be-01 655, gw-01 45, fe-01's own
suite, lint, typecheck, build, the secrets scan and the migration lint — and the
pixels job green at 160.

`build` is not runnable on h2puni: `shellcheck` is absent there and two build
targets need it. CI is where that half of the gate is observed.

### The one real failure the whole-suite run found, and what it cost

Typing the grid's **buttons** with its cells — one commit of this branch — made
`e2e/tailwind.spec.ts`'s `leaves a control inside the grid the platform's text
size` fail in CI's `pixels` (run 31617201732, one failure, gate green beside it).
That test is `shadcn-foundation`'s oracle for the `[data-grid]` guard: a chip
that reads at its cell's size is how a lost guard would show, and a rule one
layer up defeats it while the guard is intact. The buttons are back on the
platform's 13.33px — a third of a pixel of type, against blinding a guard — and
the alignment it was reaching for is asserted where it belongs, on the two
controls' centres. Re-run at `f1d4fed`: `tailwind`, `deps-cell` and `layout`
together, **55 passed**.

### The two flakes, named rather than dropped

The first full e2e run on h2puni reported three failures. One was real and is
fixed (`rests an empty cell at its own height while the picker is open`, the `+`
beside a 13px box — now a centres comparison). The other two are the ws-proxy
flake this repository
has already recorded twice — `[vite] ws proxy socket error: write EPIPE` in the
server log, `hover-cards.spec.ts`'s `opens the card above a row low in the table`
failing inside `seedPlan` on the registration button, and
`the light outranks the pointer on a banded row as well as a plain one` beside
it. Both passed on the next run of their own spec (25 passed), and
`keeps a depth-6 name readable and editable with Name dragged to its floor` did
the same — failed in a whole-file run, green on its own in 6.7s. CI's `pixels`
job is the tie-breaker and it is in the table above.

## The faults, watched

Every injection was reverted with `git checkout -- .` before the next.

| #   | Fault injected                                                    | Test that went red                                                                                                                                                                                                                                                  | What it said                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `maxWidth` summed with `FLEXIBLE_FLOOR` instead of `FLEXIBLE_CAP` | `caps the table at the fixed columns plus the Name cap`                                                                                                                                                                                                             | `expected 200 to be 420`                                                                                                                                                                                                                                                                                                               |
| F2  | `tableWidthStyle`'s `min(100%, max)` reverted to a flat `'100%'`  | `lays the cap on the table itself, with the minimum still under it`; `lays out, adds up, folds and pins a dragged Name…`; `lays the Name cap on the table itself, with nothing dragged`; `stops the table at the Name cap, and leaves the rest of the window empty` | `expected { width: '100%', minWidth: 1247 } to deeply equal { width: 'min(100%, 1467px)', …(1) }`; `expected { width: '100%', minWidth: 1055 } to deeply equal { width: 'min(100%, 1275px)', …(1) }`; `expected '100%' to be 'min(100%, 1691px)'`; **in Chromium** `the Name column is not at its cap — Expected: 420 / Received: 869` |
| F3  | `font-size` dropped from the `[data-grid] tbody` block            | `sets the grid body's type below the page's own, and keeps a row inside its budget`                                                                                                                                                                                 | `Expected: "13px" / Received: "16px"`                                                                                                                                                                                                                                                                                                  |
| F4  | `vertical-align` set back to `baseline` on the grid's boxes       | the same test, at its second assertion                                                                                                                                                                                                                              | `a single-line row is taller than the budget — Expected: <= 28 / Received: 29.1875`                                                                                                                                                                                                                                                    |
| F5  | the `<th>`'s `aria-label={…spokenHeading}` removed                | `opens with the number, the name, and then what the row waits for`; `heads each point with its first letter, and says the whole word twice over`                                                                                                                    | `Unable to find an accessible element with the role "columnheader" and name "Number"`; the same for `"optimistic"`                                                                                                                                                                                                                     |
| F6  | `ROLE_POINT_WIDTH` back to 52                                     | `has a width for every fixed column the table renders`; `adds a table up from its columns, budgeting the floor for the flexible one`                                                                                                                                | `expected { 'r1-final': 96, …(4) } to deeply equal { 'r1-final': 96, …(4) }`; `expected 1523 to be 1499`                                                                                                                                                                                                                               |

F2's four rows are one fault seen at three altitudes on purpose: the style
object, the rendered `<table>`, and the width Chromium actually laid the Name
column out at. The first two would both pass against a table that declared the
right string and was laid out by a browser that ignored it.

## Assertions intentionally superseded

| old claim                                                                                                                                               | replacement                                                                                                                                                 | fault injected                   | what was observed                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gives the name column everything the other columns did not take` — the Name column is the remainder at **every** viewport in the matrix                | `…, up to its cap`: the remainder below the cap, exactly the cap above it, plus an assertion that the matrix really holds both a narrow and a wide viewport | the cap declaration removed (F2) | at 1512 the Name column is 449px past the cap; the split test names which branch it took                                                                         |
| `says each sub-heading's whole word, which its 52px cannot` — the heading **reads** `optimistic` and the `title` is the only place the whole word lives | `heads each point with its first letter, and says the whole word twice over` — the heading reads `o`, the word is the `title` **and** the accessible name   | F5                               | `Unable to find an accessible element with the role "columnheader" and name "optimistic"`                                                                        |
| the heading row opens `['', 'Number', 'Name', 'Depends on']`                                                                                            | `['', '#', 'Name', 'Depends on']`, with the columnheader still named `Number`                                                                               | F5                               | as above                                                                                                                                                         |
| `rests an empty cell at its own height while the picker is open` compared the **tops** of the box and the `+` to a 2px tolerance                        | the same claim about their **centres**: the two are different heights (24.19px against 19.5px) on one `align-items: center` line                            | —                                | the tops assertion failed on `2.09375` and then `2.34375` as the `+` took the grid's type; a wrap, the fault it catches, is a whole line apart on either measure |
| `one role open is 1430px` / `an unfolded role costs 372` (comments in `layout.spec.ts` and `wbs-table.test.tsx`)                                        | 1406 and 348                                                                                                                                                | F6                               | `expected 1523 to be 1499` — the same 24px, three point columns wide                                                                                             |

## What this change deliberately did not measure

Every fixed column in `table-frame.ts` was measured against the browser's 16px:
the two date columns at 114px hold `20 May 2027 ?`, `not-before` holds a short
date at 84, Number's 93 holds two levels of number beside a lock and an expander.
At 13px each of them holds its envelope with room to spare, and
`e2e/layout.spec.ts` asserts the declared width is **at least** what the browser
needs — so every one of those assertions was re-run and is green, and none of the
constants moved. Narrowing them is a measurement of its own and is a non-goal
here, stated in the proposal and in `styles.css` where the type is set.
