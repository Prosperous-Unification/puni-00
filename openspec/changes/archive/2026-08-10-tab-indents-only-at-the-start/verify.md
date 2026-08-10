# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      nx test targets, all projects           850 pass  0 fail
      fe-01 (vitest, run standalone)          171 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all
Totals: 13 passed, 0 failed (13 items)
```

The 850 is the sum of every `pass` summary the nx test targets print; earlier
changes quoted a differently-counted bun figure (477), so the two are not
comparable — what matters is the 0 in the fail column, observed this run.

## The check, and the fault that broke it

| Check                                                | Fault injected                                           | What the run reported                                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab restructures only at the start (`wbs-table.tsx`) | the `atStart && !hasSelection` gate replaced with `true` | the three navigation tests failed — Tab mid-text, Shift+Tab mid-text and Tab over a selection each sent a move request instead of a focus change (3 fail, 65 pass in the file); restored, all pass |

The "at the start, unchanged" half is guarded by the pre-existing indent and
outdent tests: every `pressTab` in the suite lands on an empty input, whose
caret is position zero, so breaking the positive path breaks them.

The grid read was extracted from the arrow keys, not duplicated —
`editableGrid` is now the one committed-DOM read both `onArrowKey` and the Tab
branch use, so the two cannot disagree about what "next cell" means.

Two edge decisions the code carries:

- At the grid's edge `focusAdjacentCell` returns false and the key is left to
  the browser rather than eaten.
- The backward step guards `at + delta < 0` explicitly, because `Array.at(-1)`
  wraps to the far end — without it, Shift+Tab mid-text in the first cell
  would jump to the last cell of the table. Found as a lint fix
  (`no-unnecessary-condition` on plain indexing) that would otherwise have
  traded a dead check for a live wrap bug.

## What jsdom models and what it does not

`setSelectionRange`, `focus()` and `select()` are all real in jsdom, and
`document.activeElement` is asserted directly. The standing browser gap — a
real key in a real caret — is unchanged and needs Dany's screen at
<https://dev.wbs.bulletpoints.club>.
