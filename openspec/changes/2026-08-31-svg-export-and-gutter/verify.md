# verify — `svg-export-and-gutter`

Both slices implemented. Every figure below was read off a run in this
worktree on 2026-08-31; nothing here is derived, and what was not run says so.

## Commands

| Command                                                          | Result                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `CI=1 E2E_PORT_SHIFT=2600 bun run e2e` (the whole browser gate)  | **263 passed / 0 failed / 1 skipped in 8.5m, exit 0**                              |
| `… -g "longer than the gutter"`                                  | **1 passed** (1.8s), case 83 of the gate above                                     |
| `bunx vitest run … gantt-panel.test.tsx wbs-table.test.tsx`      | **738 passed** (160 + 578), exit 0                                                 |
| `bunx nx typecheck fe-01`                                        | exit 0 — `tsc --build --force` on both `tsconfig.app.json` and `tsconfig.e2e.json` |
| `bunx nx format:check --all`                                     | exit 0                                                                             |
| `bunx openspec validate 2026-08-31-svg-export-and-gutter --json` | 1 passed / 0 failed                                                                |
| `bunx nx run-many -t test lint typecheck build --parallel=2`     | see below                                                                          |
| `bin/h2puni-gate.sh`                                             | **not run** — exits 127 on this macOS host, as it has all session                  |

The one skip in the browser gate is `gantt.spec.ts`'s pre-existing
`test.fixme`, untouched here.

`tool-bootstrap:test` is excluded and **was not run**: it shells into a
caddy/bun host-state matrix that times out on this macOS host at ~272s a case,
which is pre-existing and recorded in `teams-and-assignees/verify.md`. It was
watched running for 5:14 without finishing before it was excluded. Nothing here
touches it.

## A lint target that could not see the file it was given

`fe-01:lint` names its inputs one by one, and `vitest.setup.ts` was not among
them: the ruler added there for this change carried an
`@typescript-eslint/no-unnecessary-condition` error that `bunx nx lint fe-01`
reported clean and CI's `run-many -t lint` would have too. **lefthook caught
it** — it lints staged files — which is the one hook this repo's rules say is
bypassable while CI is not, so the gate was the weaker of the two.

The target now names `vitest.setup.ts` and `playwright-config.test.ts`, which
were the only two of the seven `.ts` files at `apps/fe-01/` it had never
looked at. Proof: with the `?? ''` put back, `bunx nx lint fe-01` fails on
`vitest.setup.ts 153:18 error Unnecessary conditional`; with it removed the
target is green, 0 errors. Watched 2026-08-31. This is the "per-project lint
was scoped to a place the fault was not" landmine wearing a second hat — that
one was about a whole-workspace run, this one is about a file list.

The first run of the gate failed on `fe-01:lint` with three
`@typescript-eslint/no-unnecessary-condition` errors in the two new tests —
`Element.textContent` is non-nullable under this config, so `?? ''` and `?.`
around it are dead branches. Fixed, and the whole gate re-run green on the tree
that is being committed; the browser gate was re-run on that same tree too.

## Failure proofs (R5)

| Check                                                          | Fault injected                                     | Observed failure                                                                                    | Watched              |
| -------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------- |
| a name longer than the gutter ends before the first day column | `measureLabelGutterPx` answering the constant      | `the name is drawn across the divider and under the bars · Expected: <= 176 · Received: 469.609375` | Chromium, 2026-08-31 |
| the same, in arithmetic                                        | the same                                           | `expected 176 to be greater than 176`                                                               | jsdom, 2026-08-31    |
| the gutter is **one** number                                   | the axis alone put back on `LABEL_COLUMN_PX`       | `expected -165 to be 20` — the first day cell 165px left of the divider                             | jsdom, 2026-08-31    |
| the Export menu refuses a chart that is not there              | the panel's registration cleanup emptied           | `expected [] to deeply equal [ Array(1) ]` — no toast, no download, a button that does nothing      | jsdom, 2026-08-31    |
| the same                                                       | the null guard replaced by a silent `download?.()` | the same output, from the other end of the same contract                                            | jsdom, 2026-08-31    |

Every row above was watched failing before the check was believed, and the
`Proof:` comments on `measureLabelGutterPx`, on the registration effect and on
`downloadChartSvg` are quoted from these outputs rather than from an
expectation.

## What was measured, and what could not be

`getComputedTextLength` is on every browser and on no jsdom — probed, not
assumed: `grep -rl getComputedTextLength node_modules/jsdom/lib/jsdom/living/`
finds nothing, and jsdom implements no `SVGTextContentElement` at all. So
`measureLabelGutterPx` **throws** where a document cannot measure text rather
than guessing a width, and `vitest.setup.ts` grows a deterministic ruler for
the test environment — half an em a character, which is a claim about no real
font and is documented there as such. What jsdom can then say is the
arithmetic: the widest word wins, short names keep the floor, and every
coordinate in the file comes off one gutter. What only Chromium can say — that
a real name in a real font stack ends left of the divider — is
`e2e/gantt.spec.ts`'s case, which mounts the downloaded file back into the page
and compares `getBBox()` against the divider's own `x1` in the file's user
units.

Two guards in that browser case exist to stop it being a check that cannot
fail, and both are R5 #16's lesson (`gantt-calendar-axis`, a zero-width bar):
the label's measured box is asserted to have width **and** height before
anything is compared to it, and its right edge is asserted to be past
`LABEL_COLUMN_PX` — a name that fits the old gutter would satisfy every
assertion after it with the fault still in.

## What did not change

The live panel's label column is still `LABEL_COLUMN_PX` and still truncates.
A column that sized itself to the longest name would take the chart's room on
the screen the chart is the point of; the file has no such constraint, which is
why the two now differ on purpose. The panel's own `⇩` stays where it is.

## CI cancelled the browser gate, and the cap moved

The push of this change ran CI's `gate` job green and its `pixels` job **not at
all**: `timeout-minutes: 15` cut `bun run e2e` at 14m33s with **251 of 264
cases green and none red**, and the job came back `cancelled` rather than
failed. Nothing here is implicated — the same suite is 7.9-8.8m on this Mac,
three runs — and the 2026-08-31 handoff had already recorded the runner
drifting from 11.3m to 14.3m across one session while the cap stayed where it
was.

The cap is 25 now, with the reasoning written where it lives. A cap that
cancels saves none of the minutes it was set to save: the run had spent all 15
and produced no verdict. `retries` stays 0. If this is hit again the answer is
sharding or a bigger runner, which is Dany's call about CI budget rather than
another number in a workflow file.
