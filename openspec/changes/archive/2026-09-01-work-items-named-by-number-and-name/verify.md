<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on this macOS host, on `change/picker-reopens-on-click` at `57cca919` plus
the working tree. The browser gate was run **once over a tree carrying both this
change and `hints-are-the-page-s-own`**, because the two were written in one
session and share a working tree; the two commits are stacked, and this figure is
the tip's.

| Command                                                                             | Result                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `bunx nx test fe-01`                                                                | **2010 passed / 65 files**               |
| `E2E_PORT_SHIFT=1900 bunx playwright test --config apps/fe-01/playwright.config.ts` | **273 passed / 1 skipped**, 7.4m, exit 0 |
| `bunx nx lint fe-01`                                                                | **0 errors**, 1 warning (landmine #1)    |
| `bunx nx typecheck fe-01`                                                           | **exit 0**                               |
| `bunx nx format:check --all`                                                        | **clean**                                |
| `bunx openspec validate --all --json`                                               | **35 passed, 0 failed**                  |

### Not run, and why

- `bin/h2puni-gate.sh` — exits **127** on this macOS host, as it has all session.
- `tool-bootstrap:test` — times out on this host, pre-existing and unrelated.

## Failure proof (R5)

The fault this change is about is the spelling every one of these places used
before: a work item named by its number alone.

| Check                                     | Fault injected                                    | Observed failure                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the whole jsdom suite, through `rowWords` | `rowWords` reduced to `(number, _name) => number` | **61 tests failed**, across `gantt-panel.test.tsx`, `plan-cards.test.tsx` and `wbs-table.test.tsx` — among them `expected 'Waiting for 010, 020, 030' to be 'Waiting for 010 - Strip, 020 - Sand, …'`, `expected '010020' to contain '010 - Strip'`, `expected 'Waiting for 010' to contain '010 - Strip'` and ``Unable to find role="tooltip" and name `/^Start of 010 - /` `` |

That is a **whole-suite** negative rather than one assertion's, and it is the
right shape here: the claim is that one function is what every reference goes
through, so the check that it is used is every place that uses it. The function's
own `Proof:` comment carries the same output.

## Oracles that had to follow, and how they were written

Nine assertions across five files named a row the old way. Two shapes were
deliberately chosen over a literal:

- The two row toasts are `toContainEqual(expect.stringMatching(/^020 - .+ — Cmd\+Z restores$/))`.
  A literal would have pinned the test to a fixture name it does not own — and
  the first attempt did exactly that, failing on `expected [ Array(1) ] to
include 'Deleted 020 - Paint — Cmd+Z restores'` because the fixture's row is
  not called Paint. The claim is the join, so the join is what is asserted.
- The four sheet headings are matched by their opening — `/^Priority for 010 - /`
  — for the same reason.

The rest are exact, because the fixture owns both halves: `Risk — inherited from
010 - Strip the walls. Remove it there.`, `after 011 - Sanding`, and
`e2e/reference-cell-panel.spec.ts`'s `↳ Review — from 010 - Reference 010`. That
last one was the only red in an otherwise green browser gate, and it is the
change working: `- "↳ Review — from 010 Reference 010" / + "↳ Review — from 010 -
Reference 010"`.

## What was deliberately left alone

`aria-label`s. They are the accessible **names of controls**, already scoped by
the row they sit in — `Tags for 010` on a control inside row 010's own card — so
lengthening them to `Tags for 010 - Strip the walls` makes a screen reader read
the row's name back on every control of every row. They are also the handles
around three hundred tests take hold of. `proposal.md` states this as a non-goal
rather than leaving it to be discovered here.
