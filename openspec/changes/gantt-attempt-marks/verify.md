# verify — gantt-attempt-marks

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Commands

| Slice | Command | Result |
| ----- | ------- | ------ |
| —     | —       | —      |

## Failure proofs

| Check | Fault injected | Test that observed it | Observed |
| ----- | -------------- | --------------------- | -------- |
| —     | —              | —                     | —        |

## Not run

- Slices 0.2–3 (2026-10-12, lane `step-node-attempts-ui`): **blocked**. Task 0.1 makes this packet
  depend on `sub-day-gantt-axis` slices 1–3 (`AXIS_RUNGS`, the tick floor and collision list,
  `markCount` and the 2,500 offer rule), and none of them is implemented on
  `origin/batch-10/integration-10` `271604b0d` or on any pushed branch: `AXIS_RUNGS` is absent
  from fe-01 and every `sub-day-gantt-axis` task is open. At the day rungs this packet draws
  nothing by its own spec, so there is no slice that can land first. The project zone the marks
  need is on the tree read (`ChartRead.timezone`) since `step-node-attempts` slice 6.

—

## Architecture correction — 2026-10-12

Branch `batch-10/gantt-attempt-marks-rulings`, based on `origin/main`
`99f588257a0a7014ec9271224f7900ed588e6053`. This documentation change records completed-row
forecasts, explicit missing-calendar states, start-day clamping, display-range expansion,
actual-paint mutation proofs and the benchmark boundary. It also corrects the card file
ownership and makes the timezone read a declared prerequisite. No new domain term is
introduced; the existing deferred Attempt mark glossary task remains open.

| Command                                                       | Observed result            |
| ------------------------------------------------------------- | -------------------------- |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`      | 183 items passed, 0 failed |
| `bunx prettier --check` over the seven changed Markdown files | Passed                     |
| `git diff --check`                                            | Exit 0                     |

Application tests, browser tests, mutation proofs, performance measurements and the host
gate were not run for this architecture-only draft PR. All implementation tasks remain
open. The mutation cases above are required future observations, not completed proofs.

## Slice 1 — chart input and pure projection, 2026-10-12

Isolated branch `batch-10/gantt-attempt-marks-s1` starts at the corrected #371 head
`2a8f15b4f8b5d7dd11dd98aa9b138e07c73342b1`, then normally merges #373
`0940c8f03f01031199c5f6bb955ee7a34ab58346` and #372
`9b44b3eecc2bd94cd74671302b41f233bcc2dd3d`. Both subday design/tasks additions were
preserved. The earlier prerequisite block above is historical. Axis slices 1 and 3 plus attempt
inputs are integrated in this isolated stack, without a merge to main or release. Axis
slice 2 tick, hit-surface and collision integration remains a prerequisite for attempt
slice 2 and full release.

The chart carries materialized node identities, histories, start date and project zone
from one read. A shared eligible-node selection feeds the offer count and pure attempt
projection. Missing calendar inputs produce a typed unavailable state. The projection
accepts one supplied `now`, caps each mark on its start day's working window, and returns
a translated forecast and display-range origin; it leaves schedule coordinates and stored
attempts untouched. Completed leaves keep individual forecast slices at subday rungs.
The panel comparator observes zone and attempt changes. Task 0.2's glossary entry is copied
verbatim from `puni-plan/batch-10/interviews/glossary-delta.md`.

TDD observations: the initial focused run failed 20 new cases with 193 existing passes;
completed rows were one done bar rather than two slices and the count was 2500 rather than 2501. The identity-threading case separately failed before its adapter existed. The panel
memo case separately failed because the option stayed enabled after history changed.
The formatter-parts case failed before its required-part check existed.

| Command                                                                    | Observed result                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `bun install --frozen-lockfile`                                            | 1292 packages installed, exit 0                             |
| UTC Vitest geometry/input/panel/seam suites, serial one worker             | 523 passed, 4 files, 44.74s; includes formatter-parts check |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck` | Passed module checks and root TypeScript build              |
| `bunx eslint` over changed TS/TSX files with autofix                       | Exit 0 after import/Intl/nullish fixes                      |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                   | 184 items passed, 0 failed                                  |

The first Nx typecheck attempt encountered sandbox socket denials and printed no task
execution despite exit 0; it is not a passing check. Disabling daemon/plugin isolation
produced the actual successful task output. Two initial lint:fast attempts exited 1 without
printing ESLint diagnostics. A direct captured ESLint invocation exposed import order,
optional Intl part reads and nullish style errors; those were corrected. Final Nx outcomes
are recorded below.

| Check               | Injected fault                                               | Production-path test observing failure                                                              | Observed |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------- |
| Supplied clock      | Replace supplied `now` with `Date.now()`                     | `a running mark ends at the given now`                                                              | Exit 1   |
| Start-day clamp     | Use unclamped end minute, including later dates              | `overnight and multi-day attempts stop at the start day 17:00`                                      | Exit 1   |
| Completed slices    | Remove subday exclusion from done-bar coalescing             | `completed leaves keep planned slices under their attempts`                                         | Exit 1   |
| Offer count         | Drop attempt lengths from the sum                            | `attempts make 2500 forecast marks exceed the sub-day offer limit`                                  | Exit 1   |
| Visible eligibility | Add a hidden scheduled copy to the selected rows             | `hidden and held attempts do not widen the axis`                                                    | Exit 1   |
| Display union       | Retain forecast-only bounds                                  | `attempt start dates extend both sides of the forecast range without changing forecast coordinates` | Exit 1   |
| Valid instants      | Remove finite/date-range validation                          | `rejects malformed supplied start, instant and reversed intervals`                                  | Exit 1   |
| Ordered interval    | Remove end-before-start guard                                | `rejects malformed supplied start, instant and reversed intervals`                                  | Exit 1   |
| Trusted identity    | Return an empty list for a missing attempted node            | `carries attempted node identity and rejects missing trusted references`                            | Exit 1   |
| Supplied date       | Skip date validation while zone is absent                    | `validates supplied calendar facts even when the other input is unavailable`                        | Exit 1   |
| Supplied zone       | Validate UTC in place of supplied zone while start is absent | `validates supplied calendar facts even when the other input is unavailable`                        | Exit 1   |
| Clock parts         | Formatter returns no parts before required-part guard        | `rejects a formatter that omits required clock parts`                                               | Exit 1   |
| Memoization         | Omit history/zone comparisons before implementation          | `attempt and zone changes update the offer through panel memoization`                               | Exit 1   |

All temporary faults were restored. Adjacent `Proof:` comments identify the observed cases.
This slice deliberately leaves projection paint, messages, card formatting, collision-list
integration, exported SVG wiring and browser fixtures to slice 2. No browser/e2e, performance
measurement, full component suite, build or host gate has been run for this checkpoint;
no release readiness is claimed. The workstation is `pop-os`, not h2puni.

Final slice-1 checks before checkpoint: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx
run wbs-fe-01:lint:fast` passed (9.2s); the same invocation for `typecheck` passed (5.5s,
module checks and root build). The final four focused UTC suites passed 523 tests in 44.74s.
`git diff --check` exited 0.
