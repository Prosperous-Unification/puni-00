# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   214 pass  0 fail (4 new)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
20 items, 0 invalid — name-fits-and-dates-are-honest valid
```

## The checks, and the faults that broke them

| Check                                                 | Fault injected                                           | What the run reported                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| The name box fits its name (`cell-input.tsx`)         | `autoSize` removed — back to `rows={1} expandedRows={3}` | both name-box tests failed; restored, 92 pass                                                    |
| The cap lifts to write in (`cell-input.tsx`)          | `max-height` set unconditionally, focused or not         | `caps how tall a name box gets at rest, and lifts the cap to write in` failed; restored, 92 pass |
| A dateless plan takes no constraint (`wbs-table.tsx`) | `disabled={false}`                                       | `will not take an earliest start while the plan has no start date` failed; restored, 92 pass     |

## Two things this cost to learn

**The cap was wrong on the first attempt, and a test caught it.** It derived a
line height as `scrollHeight / rows`; at one row that is the height of the
whole content, so a four-line cap computed to four times the text and capped
nothing. It is `max-height` in `em` now — the browser's own line measurement,
with nothing to guess.

**`fireEvent.blur` does not move the focus.** It dispatches the event and
leaves `document.activeElement` alone, so the component still read the cell as
focused and the cap test passed against a cell that had never been left. The
tests call `node.blur()` and `node.focus()` for that reason, and both were
watched failing before the change.

## What is still not watched here

jsdom does no layout, so `scrollHeight` is faked in these tests: what is proven
is that the component sizes from it and caps correctly, not that a real browser
produces a readable row. That, and whether four lines is the right cap, is
Dany's screen.

**The table is still too wide** — everything from Total days rightward needs a
horizontal scroll. Named, not fixed, and not in this change.
