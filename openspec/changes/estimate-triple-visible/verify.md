# verify — `estimate-triple-visible`

All five slices implemented. Everything below that was not executed says so.

## The decision, and what it costs

The folded role cell's box now holds the **trio shorthand** — `2/3/8`, and `5`
where all three points agree — and the **final days** ride beside it, muted, at
the table's 10px caption type, shown only where that figure says something the
box does not.

Two alternatives were on the table and both were rejected in the design:

- **Leave the box showing the figure and add the trio beside it.** Smaller blast
  radius, and it keeps "a plan is read by the final figure". Rejected because
  Dany's words are about the box — _"I want to keep seeing the values I've put
  in"_ — and because it leaves the second fault standing: `2.2` is not a legal
  way to have typed `2/2/3`, so the one box in this grid whose at-rest value
  cannot be typed back stays that way.
- **Show the trio and drop the figure from the cell.** Narrowest, and it takes
  the per-role figure off the table entirely: the `Days` column is the sum over
  roles, and the hover card is a pointer away. Rejected.

What it costs: the bold thing in the cell is now the trio, and the per-role
figure is a muted annotation. The plan's own total days (`final-total`) is
unchanged, bold, and still where a plan is read at a glance.

**The engine is untouched.** `git status` lists no file under `libs/domain` or
`apps/be-01`. The roll-up, the estimate method and the schedule return the same
numbers; only the reading moved.

## The width finding, and why the figure is 10px

The first cut drew the figure at the row's own 13px. Measured in Chromium at
1280 that is fine for the seeded `2/3/8 · 3.7` and **wrong** for `20/24/30 ·
24.3` — the widest trio anybody has typed into this column in anger, live on
dev, 2026-08-22, and the case the browser test now carries. The box clipped by
8px inside a 96px column: `the trio does not fit the box beside its figure —
Expected: <= 0, Received: 8`. At the caption type it fits, and the same
injection is the figure's own failure proof. The column's declared width did not
move.

## Slices

| Slice | What                                                            |
| ----- | --------------------------------------------------------------- |
| 1     | `showTrio` in `estimate-draft.ts`, beside its parser            |
| 2     | `combinedValue`, the folded cell's figure, the parent's reading |
| 3     | The phone card's box and its figure                             |
| 4     | `e2e/layout.spec.ts` — the browser's two measurements           |
| 5     | `CONTEXT.md`; the gate below                                    |

## Commands

| Command                                                                                            | Result                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `bunx nx run fe-01:typecheck`                                                                      | **passed** (after the main merge)             |
| `bunx vitest run estimate-draft.test.ts plan-cards.test.tsx`                                       | **139 passed** (after the main merge)         |
| `bunx vitest run wbs-table.test.tsx -t 'one cell for the whole trio'`                              | **24 passed** (after the main merge)          |
| `HEAVY_LOCK_WAIT_SECONDS=3600 bin/with-heavy-lock.sh -- nx run-many -t test lint --projects=fe-01` | **1896 passed (60 files)**, test + lint green |
| `CI=1 E2E_PORT_SHIFT=1001 nx run fe-01:e2e -- e2e/mobile.spec.ts`                                  | **19 passed**                                 |
| `CI=1 E2E_PORT_SHIFT=1001 nx run fe-01:e2e -- e2e/hover-cards.spec.ts e2e/keyboard.spec.ts`        | **37 passed, 2 failed** — pre-existing, below |
| `openspec validate --all --json`                                                                   | **92/92 passed**                              |
| `CI=1 E2E_PORT_SHIFT=1001 nx run fe-01:e2e -- e2e/layout.spec.ts`                                  | **49 passed (1.3m)**, after the main merge    |
| prettier on every file touched                                                                     | **clean**                                     |
| `bin/h2puni-gate.sh`                                                                               | **not run** — h2puni is not this machine      |

### Rebased onto main at `b8259d9`

This branch was written against `780e58b`, killed by a rate limit mid-task, and
merged forward on 2026-08-30 across 28 commits of main — the reference-cell
popover rework, the Gantt fold cue, `work-item-types` through the UI,
`external-refs`, two migrations and the host-wide heavy lock. **One conflict,
in `bin/heavy-lock.test.sh`, resolved to main's copy** — this branch carried an
older commit of the same work and touched none of it. Nothing in the folded
estimate cell conflicted, and every check in the table below was re-run after
the merge, not carried over from before it.

Two failures seen in `wbs-table.test.tsx` before the merge were both **not this
change's**, and both are gone from main now: `gives every cell the chrome its
declared width is measured with` (`expected 'clip' to be 'hidden'`, arriving
with `fix/reference-cell-popover` and fixed on main since), and `is cancelled
rather than left holding a row nobody picked up` (`Test timed out in 5000ms`,
which passed in isolation with and without this change and was three concurrent
vitest processes, not a fault).

### The two `keyboard.spec.ts` failures are this host's, not this change's

`Escape leaves the stored day alone, blur and all` and `saves only the year that
was typed, digit by digit, in a real Chrome` both fail here, and **both fail
identically with this change stashed** on the merge commit itself: `Expected
"2026-07-01" / Received "2026-01-07"` and `Expected "2026-05-20" / Received
"2026-02-05"`. Both type digits into a native `<input type="date">`, whose
segment order is the browser's locale — the thing `playwright.config.ts` pins
`en-US` for, and which this machine is evidently not honouring. Nothing in this
change touches the date field. Watched failing on the baseline before it was
attributed.

### `E2E_PORT_SHIFT=1000` cannot be used while a dev server runs

The coordinator asked for `1000` and nothing else. `1000` moves gw-01 from 3200
to **4200**, which is fe-01's own default port and was held by a running
`bun run dev`: `http://localhost:4200/health is already used`. The shift is
usable only where 4200 is free. Every browser run recorded here used **1001**
(be 4101, gw 4201, fe 5201), which stays inside this agent's 1000-band and
misses the collision. Worth fixing in the config — a shift that maps one tier's
port onto another tier's default is a trap for whoever picks the next band.

## Failure proofs (R5)

Every one below was watched failing, then the fault reverted.

| The check                                  | Fault injected                                        | Watched failing on                                                                           |
| ------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `showTrio`'s flat collapse                 | the equality branch deleted                           | `expected '5/5/5' to be '5'`                                                                 |
| `showTrio` prints all three points         | the collapse widened to the optimistic point          | `expected '2' to be '2/3/8'`                                                                 |
| the printer is the parser's inverse        | the same                                              | `expected { kind: 'trio', days: { …(3) } } to deeply equal { kind: 'trio', days: { …(3) } }` |
| the table's cell holds the trio            | `combinedValue` back to `showFinal(row.finalDays[…])` | `expected '4' to be '2/3/10'` (+ 3 more in the same describe)                                |
| what the cell shows is what would store it | the same                                              | `expected { optimistic: 4, … } to deeply equal { optimistic: 2, realistic: 3, … }`           |
| a parent reads as a trio                   | the parent's cell put back to the figure alone        | `expected '4· 4' to contain '2/3/10'`                                                        |
| the figure is shown only where it adds     | `finalSaysMore` widened to `final !== ''`             | `expected <span …(2)></span> to be null` — the cell reading `5 · 5`                          |
| the figure is read off the row             | the figure computed from `combinedValue`'s text       | `expected '· ' to be '· 4'`                                                                  |
| the card's box holds the trio              | `combinedValue` back to the final figure              | `expected '3.7' to be '2/3/8'`                                                               |
| the card's figure beside it                | the `data-card-final` span never rendered             | `expected undefined to be '· 3.7'`                                                           |
| the trio fits the box beside its figure    | the figure drawn at the row's own 13px                | `Expected: <= 0, Received: 8` (Chromium)                                                     |
| the row does not grow                      | the cell wrapper's `display: flex` → `block`          | `Expected: 26.1875 / Received: 44.375` (Chromium)                                            |

### Five checks that could not fail, caught while writing them

None shipped. All five are the same family — **an assertion made outside the
window the fault lives in** — and the first four are one mechanism: this box is
uncontrolled and holds what was typed from the keystroke onwards, so anything
asserted about its value is already true before the round trip that would have
falsified it.

1. `keeps the trio in the cell once the estimate lands`, first written as
   `await waitFor(() => expect(cell.value).toBe('2/3/10'))`. Watched **passing**
   with `combinedValue` put back to the final figure: `waitFor` is satisfied on
   its first sample, when the box still holds the typed characters, and never
   looks again. It waits on the **figure** now — which appears only once be-01
   has answered — and then reads the box.
2. `says a flat trio once` had the same shape, and no figure to wait on (that is
   its subject). It waits on the row's total days instead.
3. `takes back what it shows, unchanged` typed a cell's own value back into
   itself. `LiveField` diffs that against its baseline and sends nothing, so the
   stored estimate was untouched whatever the cell showed. It is now
   `copies one row's cell into another and lands the same estimate` — two rows,
   which is the only way this property is observable on the production path.
4. `keeps the stored figure beside a half-typed cell` typed `9/9/` and did not
   blur. The folded cell writes **no draft on a keystroke** — `onTyped` is the
   `@` list's — so `combinedValue` still read the stored trio and the
   live-preview fault was invisible. It blurs a refused entry now, which is
   where a draft is actually held; renamed to say so.
5. The browser's `clipped` assertion was first proved with `flex: 1` on the
   figure. Watched **passing**: both children then share the slack and neither
   clips. Replaced by a case that can actually run out of room — `20/24/30` —
   which found the 13px design genuinely broken (above). The width proof is now
   the type size, and that fault was watched.

## What is not verified

- **The assignee is not in the browser measurement.** `2/3/8 · 3.7` and
  `20/24/30 · 24.3` were measured on a cell with nobody assigned to it; the
  seed assigns nobody, and mentioning somebody through the cell's `@` list is
  not something any e2e in this repo does yet. A wide trio, its figure **and**
  initials will not all fit 96px, and the box is what gives — it is `flex: 1`
  with `minWidth: 0`, so it scrolls rather than pushing anything out of the
  cell. Nothing overruns and no row grows; the trio is what gets cut. Named
  here rather than asserted.
- **A parent's summed trio can carry floating-point noise.** be-01 sums the
  points, so two children of `0.1/0.2/0.3` roll up to
  `0.2/0.4/0.6000000000000001`, and `showTrio` prints each point exactly, as
  `showDays` already does in the three unfolded boxes. Pre-existing and
  deliberately unchanged: rounding here and not there would put two spellings of
  one number in one row, and the sum is be-01's to round if it should be.
- `bin/h2puni-gate.sh` — h2puni is not this machine.
- The card face's **geometry** is not measured. `e2e/mobile.spec.ts` passes
  (19 tests) with the new figure on the card, but nothing in it asserts a width
  or a height for it at 390×844 — the card row is a flex line with a truncating
  assignee and far more room than 96px, so this was not judged worth a new
  browser case.
- **The whole browser gate was not run in one go.** Four of its nine specs were:
  `layout` (49), `mobile` (19), `hover-cards` and `keyboard` (37 + the 2
  pre-existing failures above). `directory`, `gantt`, `header`, `plan-surface`,
  `steps` and `reference-cells` were not — the host lock was held by another
  agent's full e2e run for most of this session, and this change draws no CSS
  rule any of them share. Named rather than claimed.
