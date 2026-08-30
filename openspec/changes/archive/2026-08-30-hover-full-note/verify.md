# Verify — hover-full-note

## Commands

| Command                                                      | Result                     |
| ------------------------------------------------------------ | -------------------------- |
| `bunx nx format:check --all`                                 | pass, no output            |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass, exit 0, 21 projects  |
| `bunx nx e2e fe-01`                                          | see **Browser gate** below |
| `openspec validate --all --json`                             | see below                  |

`bunx nx lint fe-01` failed once on `jsdoc/check-param-names` — `roomForCard`'s
object parameter needs a `@param` line per member. Two lines added, re-run
green.

## Browser gate, and which checkout it measured

`reuseExistingServer: !isCi` is this repo's known landmine (`LLM_README.md`): a
`bun run dev` from another checkout holding 4200 makes the browser gate measure
code this worktree never built. That happened at the start of this session — a
dev server from `~/wd/personal/wbs-tool/wbs-tool-v1` held 3100/3200/4200. It was
killed and this checkout's started in its place, and the owner was re-read from
each listening process's own working directory immediately before the gate:

```
$ for p in $(lsof -nP -iTCP:4200 -sTCP:LISTEN -t); do lsof -a -p $p -d cwd -Fn | grep ^n; done
n/Users/danylofedorov/wd/puni/wbs-tool-v1/apps/fe-01
```

## Failure proof

Every check below was watched failing with the named fault injected, and green
with it removed. Unit faults were injected into `hover-card.tsx` and run with
`bunx nx test fe-01 -- --run hover-card`; browser faults with
`bunx nx e2e fe-01 -- --grep "takes the room around its cell"`.

| Fault injected                                   | Test that failed                                                         | Observed failure                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `side` forced to `'below'`                       | `flips above when the cell is low…`, `gives a card on the fold a floor…` | `expected { side: 'below', maxHeight: 794 } to deeply equal { side: 'above', maxHeight: 794 }`  |
| `Math.min` against `VIEWPORT_SHARE` dropped      | `never takes more than nine tenths of the window`                        | `expected { …maxHeight: 994 } to deeply equal { …maxHeight: 900 }`                              |
| `SCROLLING_MIN_HEIGHT` dropped from `Math.max`   | `gives a card on the fold a floor to be readable in`                     | `expected { side: 'above', maxHeight: 144 } to deeply equal { …maxHeight: 160 }`                |
| `Math.max(below, above, MIN)` reduced to `above` | `opens downward, as tall as the room below…`                             | `expected { …maxHeight: 194 } to deeply equal { …maxHeight: 794 }`                              |
| The `useLayoutEffect` never measures             | `sizes the one card that scrolls from the room around its cell`          | `expected '160px' not to be '160px'`                                                            |
| `maxWidth` widened for every card                | `leaves every other card its own width`                                  | `expected 'min(640px, 100vw)' to be '420px'`                                                    |
| `maxHeight` pinned back to a flat `320`          | **browser**: `gives a long note the room below rather than 320px of it`  | `the card is still the old 320px slot`                                                          |
| `side` forced to `'below'`                       | **browser**: `opens the card above a row low in the table`               | `the card opened downward from a row with no room below it: Expected: <= 459, Received: 936`    |
| `boxSizing: 'border-box'` removed                | **browser**: both of the above                                           | `the card runs off the bottom of the window`, `the flipped card runs off the top of the window` |

`box-sizing` is in that table because it is the line the gate **found**: with
the height ceiling correct and the box still `content-box`, the card's own 6px
padding and 1px border were added to the ceiling and the card ended at
`cardBottom: 908` in a 900px window. Measured in Chromium, not reasoned about.

## A guard deliberately not written

`HoverCard`'s layout effect narrows `card.current?.parentElement` with an early
return rather than a throw. R5 says unknown state throws — and a layout effect
runs on a mounted node, whose parent cannot be null, so no injected fault could
make that throw fire. A check whose failure can never be observed is the fault
R5's tally counts, and `column-widths-drag` deleted a line for exactly this
reason one change ago. What is proven instead is that the measurement happens:
the two negatives named above.

## Re-gated after the rebase onto `origin/main`

The base moved 20+ commits (`e0bfcef` → `e3918f6`, `gantt-declutter` and
`dep-waits-on-first-role` among them) and this change was rebased onto it. A
clean rebase is not evidence, so the whole gate was run again on the new base:
`format:check --all` exit 0, `test lint typecheck build` exit 0 across 21
projects, and the browser gate **127 passed, 4 failed of 131** — all 14
hover-card tests green, the same four failures below, and two tests that did
not exist before the rebase. None of the three files this change touches was
edited by anything that landed in between (`git log e0bfcef..origin/main --
<the three>` is empty).

## Known-failing, unrelated — and proven so

`bunx nx e2e fe-01` before the rebase: **125 passed, 4 failed** of 129. Every
hover-card test passed, the two new ones and the nine already there — including
`scrolls a note taller than the preview once the pointer is on it`, the one
this change could plausibly have broken by moving the card.

The four failures:

- `directory.spec.ts:131` adds, renames, and chips a membership
- `directory.spec.ts:217` stacks the two panels into one column…
- `directory.spec.ts:258` gives every control it offers at least 44px…
- `layout.spec.ts:1733` opens the folded role's @ picker out past the bottom…

Not asserted to be unrelated — **watched**. `git stash push -- apps/fe-01` took
the change out of the tree entirely and the same four were re-run against it:
all four failed again, identically. Restored with `git stash pop`.

The root cause is the shared dev database rather than any of this. The @ picker
one says so plainly: it types `@Kat` and waits for the _create_ option
`Add "Kat"`, and `select name from person where name like '%Kat%'` on
`apps/be-01/local.db` answers `Kat` — a person an earlier run already made, so
the picker offers the existing one and never the create. That file holds 8
people and 6 service teams accumulated across runs, which is the same shape as
the three directory failures. Their own change, not this one.
