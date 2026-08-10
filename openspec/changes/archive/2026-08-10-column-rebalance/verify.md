# Verification — `column-rebalance`

Branch `change/column-rebalance`, from `origin/main` @ `04acf09`. All output below is fresh,
taken 2026-08-10 on darwin/arm64 against this worktree's own stack.

`origin/main` moved three commits during the work (`5d21e4b project-dropdown-details`,
`18d5d72 axis-date-hover`, `48c5f59` merge). Not rebased onto them, deliberately: they touch
`gantt-panel.tsx`, `project-page.tsx`, `header.spec.ts` and `gantt.spec.ts`'s hover block, and
this change touches `table-frame.ts` and the width literals — no file overlaps except
`gantt.spec.ts`, in a different function.

## The three widths, and where each number comes from

| Column   | Was | Now     | Measured                                                                                         |
| -------- | --- | ------- | ------------------------------------------------------------------------------------------------ |
| `number` | 169 | **93**  | 92.5625px — `030.1` at a two-level row's 12px indent, expander, lock, and the cell's 8px padding |
| `start`  | 52  | **114** | 113.859375px — `20 May 2027 ?` in a Start cell plus that 8px                                     |
| `finish` | 52  | **114** | the same envelope; the pair takes the wider of the two, which is End's marked day                |

**84 was wrong**, and this is the number Dany's decision named: at 84 the browser draws
`20 May 2027` on two lines. Watched — the table below.

Everything the widths move, recomputed and pinned: Name is pinned at 117 rather than 193, a
two-role folded plan declares 1171px undated and 1199 dated (was 1123 / 1151), three folded
1267, one role unfolded 1447.

**A three-phase plan no longer fits a 1280 laptop.** Its folded minimum is 1267 against a
1248px frame — it was 1247, one pixel inside — so the frame scrolls and the pinned columns
hold the left edge. That is the documented backstop rather than a new failure, and it is not
avoidable at any width that fits a dated day: even without End's marker the three-phase figure
is 1269.

## Commands

| Command                                                                      | Result                                  |
| ---------------------------------------------------------------------------- | --------------------------------------- |
| `bunx nx format:check --all`                                                 | green, no output                        |
| `bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache` | green, 21 projects                      |
| `bunx openspec validate --all --json`                                        | `items: 60, passed: 60, failed: 0`      |
| `bunx vitest run --root apps/fe-01 …table-frame.test.ts`                     | `Tests 32 passed (32)`                  |
| `bunx vitest run --root apps/fe-01 …wbs-table.test.tsx`                      | `Tests 353 passed (353)`                |
| the browser gate, all specs                                                  | `109 passed`, twice; see the flake note |

`nx` reported `gw-01:test` as a flaky task; run alone with `--skip-nx-cache` it is `43 pass, 0
fail`. Nothing in this change touches gw-01.

### The browser gate did not run through `bun run e2e`, and why

The committed Playwright config sets `reuseExistingServer: !isCi`, and this machine serves
other checkouts on 3100/3200/4200 — a gate run through it measures a table this worktree never
built. That hazard is already a landmine in `LLM_README.md`. This change's browser proofs were
taken through an **uncommitted** copy of the config on 3171/3271/4271 with
`reuseExistingServer: false`, starting this worktree's own three servers. The file is
`tmp/pw-shifted.config.ts` and is deliberately not committed (`tmp/` is ignored).

### One flake, observed

`gantt.spec.ts` › `takes the cards face to a row when its bar is clicked` failed once, on a
`toBeVisible` timeout, in the second of three full-gate runs. It passed in the other two and
twice more on its own immediately afterwards. It is a phone/cards test and this change moves
no card. The same shape of flake is recorded at the base in `gantt-calendar-axis/verify.md`.
**Not investigated further and not claimed fixed.**

## Failure-proof table

Every check below was watched failing with the named fault injected, then the fault reverted
and the check watched green again. Messages are quoted as the runner printed them.

| Check                                                              | Fault injected                                      | Observed                                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `draws a dated Start and End on one line`                          | `DATE_COLUMN_WIDTH` 114 → 52, the width it had      | `Start wraps its day`: `Start reads "20 May 2027" on 3 lines`, `"25 May 2027" on 3 lines`                       |
| `draws a dated Start and End on one line`                          | `DATE_COLUMN_WIDTH` 114 → **84**, the planned width | the same assertion: `Start reads "20 May 2027" on 2 lines`, `"25 May 2027" on 2 lines`                          |
| `is as wide as the widest day the formatter can print`             | `DATE_COLUMN_WIDTH` 114 → 52                        | `start declares 52px where the widest day it can print, "20 May 2027 ?", needs 114` — `Expected: >= 113.859375` |
| `is as wide as the widest day the formatter can print`             | `DATE_COLUMN_WIDTH` 114 → 84                        | the same sentence, `Received: 84`                                                                               |
| `the Number column fits its envelope`                              | `['number', 93]` → 56                               | `Expected: >= 92.5625 / Received: 56`                                                                           |
| `clips a number past the envelope and keeps it whole in the title` | `whiteSpace: 'nowrap'` dropped from the Number cell | `expected true to be false` — a wrapped number overruns downwards, so there is no clip left to see              |

The unit half moves with the same numbers rather than being asserted twice: `table-frame.test.ts`
holds the literal width table, the pinned offsets and the three folded/unfolded equations, and
every one of them went red on the first run with the new constants in and the old literals
still there.

### A check that could not fail, caught before it shipped

The first version of `draws a dated Start and End on one line` counted lines as
`drawn.getClientRects().length`. **That is fragments, not lines.** React renders End's day and
its no-estimate marker as two adjacent text nodes, and Chromium hands back a rect for each of
them on one unwrapped line — so the check reported `End reads "25 May 2027 ?" on 2 lines` for a
cell measured at 105.86px inside a 106px content box, which had not wrapped at all. Written as
it was, it would have failed at every width including the right one, and the temptation was to
widen the column until it went green. The line count is now the drawn element's height over the
height of the same string drawn `nowrap` in the same cell, and both faults above were watched
through the corrected oracle.

The second one is in the same test's sibling. `is as wide as the widest day the formatter can
print` first asserted `widest.text === DAY_ENVELOPE`. Several days are exactly as wide as each
other in this font — `10 May 2027 ?` and `20 May 2027 ?` measure identically — so that
assertion pinned which of a set of ties the loop happened to reach first, and it failed on
`Expected: "20 May 2027 ?" / Received: "10 May 2027 ?"` for a reason that has nothing to do
with a column being too narrow. It compares widths now: no day the formatter prints is wider
than the envelope.

### A fixture that only worked because the rows were too tall

`gantt.spec.ts`'s `seedEdgeRoutes` failed deterministically with the new widths —
`<li role="option">040 - </li> … intercepts pointer events`. Enter commits a dependency chip
and leaves the picker open on what is still pickable, and that list hangs over the rows
underneath; the loop's next click went to `040`'s own box, which was behind it. It landed
before this change only because the rows were **two lines tall** while the 52px date columns
wrapped their days, so the list stopped short of the row the loop goes to next. The fixture
presses Escape and asserts the list is gone. No production behaviour changed: a popover
covering the rows below it is what the clip exemption is for.

## Not verified

- **No dev deploy and no hand-driven Chrome.** Everything above is a local chromium against
  locally started servers. Dany has not looked at the rebalanced table.
- **h2puni was not used**, so the amd64 rendering path is untested for this change.
- The committed `bun run e2e` path is unverified here, for the reason above.
- **The `not-before` column is left at 84/56 and is now the one date column that still wraps.**
  84 holds `1 Jun` but not `20 May 2027`, which needs 101px by the same measurement — Dany's
  decision named Start and End only, and widening it to the same 114 would put a dated
  two-phase plan at 1229 against a 1248 frame with three phases already over. Reported, not
  changed.
- **At the deepest indent the Number column now shows almost none of its number.** 48px of
  indent, a 12.5px expander and a 20px lock leave a few pixels of a 93px column, and the
  `title` carries the number. That is the envelope Dany chose applied to a row four levels
  down; it is stated in the spec and in `NUMBER_ENVELOPE`'s JSDoc, and it is the knob to turn
  if it reads as broken.
- Nothing was pushed, merged, or deployed.
