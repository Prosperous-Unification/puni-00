## Commands and results

Recorded as run; sections below are filled as the change progresses.

### Unit and jsdom suites

- `bunx vitest run src/components/wbs/pointed-row-store.test.ts` — 8 passed.
- `bunx vitest run src/components/wbs/wbs-table.test.tsx` — 585 passed (whole
  file, never filtered), with the new probe `pointing a row from the chart
re-renders no unrelated row` among them.
- `bunx vitest run src/components/wbs/gantt-panel.test.tsx` — 161 passed, with
  `pointing a row re-renders no Gantt mark` among them.
- `bunx vitest run` (all of fe-01) — 2044 passed, 2 failed, and the 2 are
  pre-existing on `main` (verified by stashing this change and re-running):
  `plan-mermaid.test.ts`'s two `excludes-weekends` cases assert UTC-midnight
  instants and this machine is UTC+3, so Mermaid's local-time parse lands at
  `21:00` the day before. A timezone artifact of the machine, not of this
  change; CI runs UTC.
- `bunx nx typecheck fe-01` — green (tsc --build --force, app + e2e projects).
- `bunx nx lint fe-01` — green (one pre-existing warning on `main`, unrelated).
- `openspec validate --all` — 31 passed, 0 failed.

### Browser gate

- `bun run e2e:beside-dev` (whole suite, shifted ports 3600/3700/4700) —
  **282 passed, 1 skipped, 8.5m**. The skip is `gantt.spec.ts`'s pre-existing
  `test.fixme('dragging up moves the boundary up')`, deliberate on `main`. The
  new seam case `crossing from a table row to another row's line moves every
light with it` is among the passes, as are all the tint/color assertions
  over the moved SVG blocks (paint order unchanged).
- `bunx nx format:check --all` — clean.
- `bunx nx run-many -t lint typecheck` — 23 projects green.
- `bunx nx run-many -t test` — every project green except `tool-bootstrap`,
  whose `configure.sh Caddyfile merge, executed` cases hang 16s against a 5s
  timeout and read `status null` where `status 7` is expected — on an idle
  machine too, and `git diff main -- tools/` is empty, so the fault is this
  machine's shell-spawn environment, not this change's. CI (UTC, Linux) is the
  enforcement point, as it is for the two `plan-mermaid` timezone cases above.

### Measurement (Chromium, dev server, 28-row plan "Image Service improvement | 2")

Before (main, measured 2026-09-01 with a synthetic `pointerover` sweep and a
MessageChannel poll until `data-gantt-row-lit` moved):

- Gantt open: 73.9–121ms of JS per pointed row (six samples: 121, 85.6, 94.9,
  77.3, 89.1, 73.9).
- Gantt closed: 39.9–59.7ms per pointed row.
- Real CDP hovers with the chart open registered as 60–130ms long tasks.

After (same page, same protocol, measured while the full fe-01 vitest suite
was running on the same machine — contention, not a favourable lab):

- Gantt open: 8.3–15.4ms per pointed row after warm-up (six samples: 33.9,
  13.2, 15.4, 9.4, 8.3, 9.5) — the first sample carries the JIT/HMR warm-up.
  Under a 16.7ms frame from the second sample on, against 73.9–121ms before:
  roughly a 9× cut at the median.

## R5 failure-proof table

| Check                                | Fault injected                                                 | Observed failure                                                                                                | Test                                                                                             |
| ------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Row render isolation (probe 1.1)     | Original design: pointed row as `WbsTable` state               | `expected 7 to be less than or equal to 4`                                                                      | `wbs-table.test.tsx` › `pointing a row from the chart re-renders no unrelated row`               |
| Row render isolation (1.4)           | Store writes echoed back into a `WbsTable` `useState`          | `expected 7 to be less than or equal to 4`                                                                      | same                                                                                             |
| Shown-row guard in the store         | Guard dropped to a bare fallthrough (`tablePointed` unchecked) | `expected 'b' to be 'a'`                                                                                        | `pointed-row-store.test.ts` › `falls to the chart when the pointed table row is no longer shown` |
| Store notifies only on change        | `if (now === resolved) return;` removed                        | `expected [ 'told' ] to deeply equal []` (both silence tests)                                                   | `pointed-row-store.test.ts` › `says nothing…` ×2                                                 |
| Gantt marks memo                     | `pointedRow` added to `marksOverLight` deps                    | `expected 4 to be +0` at the marks' counter                                                                     | `gantt-panel.test.tsx` › `pointing a row re-renders no Gantt mark`                               |
| Bar words memo                       | `pointedRow` added to `barWords` deps                          | `expected 2 to be +0` at the words' counter                                                                     | same                                                                                             |
| Probe oracles are on the render path | (positive guard in the probe itself)                           | `expect(initialsCalls.count).toBeGreaterThan(0)` and the same for `shortDateCalls`, asserted before any silence | same                                                                                             |

## Skipped / not verified

- `bin/h2puni-gate.sh` — not on h2puni; local runs are not serialised
  (`project_heavy_lock_macos`).
