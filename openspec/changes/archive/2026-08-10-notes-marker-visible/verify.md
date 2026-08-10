# `notes-marker-visible` — verify

Run on 2026-08-09 from the workspace root on branch
`change/notes-marker-visible`, rebased onto main `e9a1308` after the
`compact-columns` batch landed mid-flight and superseded this change's date
half (see proposal.md).

## The reviews

The full `marker-and-date-polish` diff — this marker work plus the
now-superseded date half — was reviewed by codex (REQUEST-CHANGES, 4
findings) and agy (2 findings) before the rebase. Findings that touched the
marker and survive the trim:

- codex 3 (speculative): the grown marker as a dead click over the name — the
  marker now forwards its press to the name box, and the unit test holds it.
- The rest targeted the date half or its tests, all addressed there and then
  dropped with it; agy's High (a NaN comparison in the first height test) was
  confirmed by a failing run before the trim made it moot.

## The checks, and the faults that broke them

| Fault injected             | Test                                         | What the run reported          |
| -------------------------- | -------------------------------------------- | ------------------------------ |
| marker size put back to 11 | `marks a row that has notes, and only one …` | `expected '11px' to be '15px'` |

Watched on this branch, on the rebased base, then restored and re-run green
(1 passed, 338 skipped).

## The gate

| command                                                      | result            |
| ------------------------------------------------------------ | ----------------- |
| `bunx nx format:check --all`                                 | pass              |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass, 21 projects |
| `openspec validate --all`                                    | all valid         |
| the browser suite                                            | see below         |

The browser suite runs against the live dev stack locally; one layout.spec
test (`opens the folded role’s @ picker …`) fails there against the polluted
dev database and was shown to fail identically on main before this change —
CI's fresh database is the oracle for it.

## What is not watched here

The marker's hit-area geometry against the textarea's own resize grip — the
grip is bottom-right, the marker top-right, and no browser assertion measures
their non-overlap. Dany's screen.
