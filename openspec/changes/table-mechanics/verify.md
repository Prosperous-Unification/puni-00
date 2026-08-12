# Verification

Everything below was run for this change. Nothing here is quoted from a
previous change's run, and where a fault was predicted to redden a test and did
not, that is written down as such rather than dropped.

## Where things ran

This box (`h1claw`) runs no test suite and no build — Dany's rule, 2026-08-12,
enforced by a `PreToolUse` hook. Two places did the work instead:

- **CI**, `gh workflow run ci.yml --ref change/table-mechanics`: the whole gate
  (`format:check`, `run-many -t test lint typecheck build`, the secrets scan,
  the doc caps, `openspec validate --all --json`) and the `pixels` job, which
  is `bun run e2e` against a real chromium.
- **h2puni**, a worktree of this branch at `~/wd/puni/wt-table-mechanics`, for
  the fault injections: unit specs under a real node
  (`node node_modules/vitest/vitest.mjs run …` — bun's own worker RPC cannot
  run vitest here, see the landmine below), e2e in the official Playwright
  image, `~/tm-e2e.sh`, the rig `table-geometry-and-tab-order` left behind.

### Landmine: `nx run-many -t test` on h2puni is vacuous

`bunx vitest` under bun 1.3.14 on h2puni dies in its own worker bootstrap
(`TypeError: port.addListener is not a function`) and reports **`Test Files no
tests`** — and `nx run fe-01:test` wraps it and exits **0**. A green
`run-many -t test` on that host says nothing about fe-01. The suite here was
run under a real node (v22.14.0, unpacked to `~/tools`) for that reason. CI
has node and does not have the problem.

## The gate

- `bunx nx format:check --all` — green (CI, run 31594340389)
- `bunx nx run-many -t test lint typecheck build --parallel=2` — green (CI)
- `bun run e2e` — green (CI `pixels`)
- `bunx @fission-ai/openspec@1.3.0 validate --all --json` — green (CI)
- fe-01 unit suite on h2puni, under node: **46 files, 1148 passed**

## The faults, watched

Unit injections were run with
`node ../../node_modules/vitest/vitest.mjs run <spec> -t <block>`; e2e ones
with `~/tm-e2e.sh <spec> -g <name>`. Every one was reverted with
`git checkout -- .` before the next.

| #   | Fault injected                                                  | Tests that went red                                                                                         | What they said                                                                                                                                   |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| I1  | `escapesAnOpenList` branch in the Depends on cell forced false  | 4 (Ctrl+H/L, Ctrl+J/K, Alt+↑/↓, Alt+→/←, Depends on)                                                        | `expected <input …(11)></input> to be <textarea …(5)></textarea>`; `expected [ '010', '020', '030' ] to deeply equal [ '010', '010.1', '020' ]`  |
| I2  | the same branch in `CreatablePicker` forced false               | 5 (the four Service/team cases and the assignee case)                                                       | `expected <input …(9)></input> to be <input …(7)></input>`; `expected [ 'Strip', 'Sand', 'Paint' ] to deeply equal [ 'Sand', 'Strip', 'Paint' ]` |
| I3  | both `onAltMove` calls removed from the earliest-start handlers | 3 (Alt+↑/↓, Alt+→/←, and the open editor)                                                                   | `expected [ '010', '020', '030' ] to deeply equal [ '010', '010.1', '020' ]`                                                                     |
| I4  | the Tab branch of the sheet's key handler returns early         | 2 (`keeps Tab inside the sheet, at both ends of it`, `brings a Tab pressed outside the sheet back into it`) | `expected false to be true`                                                                                                                      |
| I5  | Escape put back on the backdrop as a React handler              | 1 (`closes on Escape from anywhere on the page, not only from inside it`)                                   | `expected <div role="dialog" …(4)>…(6)</div> to be null`                                                                                         |
| E1  | `[data-grid] textarea { resize: none }` deleted                 | 1 (`dragging the bottom-right corner leaves the row the height its text asks for`)                          | `the box still offers a resize handle … Expected: "none" Received: "both"`                                                                       |
| E2  | `tbody tr:nth-child(even):hover` deleted                        | 1 (`a banded row moves as far under the pointer as a plain one`)                                            | `the pointer moves a banded row and a plain row by different amounts … Expected: < 3 Received: 7.2126`                                           |
| E3  | `DEEPEST_INDENT` back to 4 and the 11px off `[data-number]`     | 1 (`two rows a level apart read as two different numbers at depth 4`)                                       | `the number at depth 4 is not shown whole … Expected: "030.1.1.1" Received: "030.1"`                                                             |
| E4  | the Tab branch dead, in a browser                               | 1 (`Tab never leaves it, and Escape still closes it afterwards`)                                            | `the focus walked out of the sheet on Tab 2 of 12`                                                                                               |
| E6  | `event.target === event.currentTarget` inverted                 | 1 (`a click on the backdrop closes it, and a click on the sheet does not`)                                  | `expect(locator).toBeVisible() failed … element(s) not found`                                                                                    |

Fifteen unit reds and five browser reds, each watched and each reverted.

## What did **not** red, and what that changed

Four predictions failed. Three of them were the test being weaker than its
name, and each was fixed rather than explained away.

**E5 — Escape back on the backdrop, in a browser: still green.** With the focus
trap in place the focus never leaves the sheet, so an Escape aimed inside it
reaches a React handler on the backdrop by bubbling, exactly as it did before.
The audit's fault was the _chain_ — Tab out first, Escape dead after — and a
Playwright expect that has already failed on Tab 2 never reaches the Escape
below it. The Escape half is held by the unit test instead (I5, red above), and
`e2e/keyboard.spec.ts` now says so where it used to claim a red it never had.

**E3 — the first version of the depth-4 pin passed on the audit's own
geometry.** It asserted only that the two visible prefixes differ; with the cap
at 4 they are `030.1` and `030`, which differ and are neither of them a number.
The test now asserts what a reader needs: the four-segment number is drawn
**whole** and the five-segment one shows strictly more of its own than that.
Measured, at 1400px, with the numbering frozen so both rows carry the lock:

| geometry                  | `030.1.1.1` shows | `030.1.1.1.1` shows |
| ------------------------- | ----------------- | ------------------- |
| cap 4, 16px (before)      | `030.1`           | `030`               |
| cap 2, 11px (this change) | `030.1.1.1`       | `030.1.1.1.`        |

The deeper number is still a glyph short of whole and still carries the rest in
its `title`. That is the column's declared width doing what it has always done,
it is written into the requirement rather than papered over, and
`spreadsheet-geometry` is where a wider column would belong.

**`a hovered banded row is nobody else's colour` did not red under E2.** The
single absolute `--grid-hover` was already distinct from both rest shades; what
it got wrong was the _size of the step_, which is the other test. Kept as a
pin, not claimed as a proof.

**The two Ctrl chord cases in the earliest-start cell did not red under I3.**
They were never broken: that cell has called `onCommandKey` since the chords
shipped, and only the row moves were missing. The proposal and the spec said
"answered none of the eight" and now say what is true. The two cases stay as
pins on a promise nothing else pinned.

## Three defects found in the inherited work

The branch was picked up from a previous agent's WIP commit after this box
hard-rebooted. Its e2e tests had not been run. Running them found:

1. **The resize grip was inline, not Tailwind's.** The Name cell's own `style`
   object in `wbs-table.tsx` set `resize: 'vertical'`, and an inline property
   outranks every stylesheet — the served CSS carries no preflight `resize`
   rule at all. The rule in `styles.css` could not reach the box and the test
   reported `Received: "vertical"`. The inline property is gone; the rule is
   now what holds, and E1 proves it.
2. **Both new hover tests seeded a second plan over the first.** The file's own
   `beforeEach` already signs up and seeds; a second `seedPlan` inside the test
   waited 60s for a Register button that is not on a signed-in page.
3. **The depth-4 pin was vacuous**, as above.
