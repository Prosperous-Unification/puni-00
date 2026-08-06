# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      be-01 (bun:test)   258 pass  0 fail
      fe-01 (vitest)     197 pass  0 fail
      libs/domain         11 pass  0 fail (4 new)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
16 items, 0 invalid — estimate-ux valid
```

## The checks, and the faults that broke them

| Check                                                        | Fault injected                                                       | What the run reported                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Estimates are never repaired (`estimate-draft.ts`)           | `sendableTrio` restored to the old nudge — fill the gaps and send it | 5 tests failed across the pure module and the table: `5` alone was sent as `5/5/5` again; restored, 83 pass                 |
| The schedule uses the project's method (`work-item.service`) | `durationsOf` pinned back to `'pert'`                                | `plans the dates with the same figure it prints` failed — the column read 10 and the dates read 4; restored, 28 pass        |
| A stored method is checked (`project.ts`, `toProject`)       | (covered by its own test, which writes `median` past the repository) | `throws rather than planning with a method the database should not hold` — the read throws instead of quietly planning PERT |

`finalDays` earned its own guard along the way. Before it threw on an unknown
method, a project row whose method was `undefined` produced `estimate[undefined]`
→ `NaN`, and the schedule came back **`NaN` days, marked estimated** — blank
cells that read as "no dates yet" rather than as a fault. It was found by a real
test failing, not by reading code, and it is exactly the R5 shape: unknown
converted to a plausible-looking answer.

## Two decisions worth arguing with

1. **A half-filled trio is marked invalid rather than left quiet.** be-01
   stores three numbers or none, so `5 / _ / _` saves nothing. The alternative
   — say nothing until all three are filled — means a person types a number,
   walks away, and it is gone. A visible complaint about an unsaved estimate
   beats a silent loss, but it does mean a box turns red the moment you start
   typing a trio. Reversible in one line if Dany hates it.
2. **fe-01 declares its own `EstimateMethod`** rather than importing
   `libs/domain`. Every wire type in `wbs-api.ts` is already declared there for
   the same reason: `libs/domain` pulls arktype in for runtime validation, and
   that has no business in a browser bundle. The cost is one four-string list
   in two places; be-01 remains the only enforcer.

## What is not watched here

The pixels: the red fields, the narrower boxes, the two new columns and the
"Plan with" selector. jsdom asserts `aria-invalid`, the titles and the rendered
figures; nobody on this box has seen them. Standing browser gap — needs Dany's
screen at <https://dev.wbs.bulletpoints.club>.
