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

Prerequisite follow-ups were normally merged after the green checkpoint: #371
`13977965d267576a9cb838f119a64f5d7d2dfede` and #373
`87976f796965985e13a67810561573b07b7cdfc8`. Both merges were conflict-free and preserve
both verification histories. The merged branch again passed the same 523 focused tests
(45.63s), Nx `lint:fast`, Nx `typecheck`, and all 184 OpenSpec validation items. A final
mechanical naming pass gives new helpers verb-object names and names the anchor's retirement
packet in its own JSDoc. Read-only architecture review found no blocking geometry/input
issue and confirmed the mutation logs; its prerequisite-wording correction is applied above.

After the mechanical naming pass, geometry/input suites passed all 220 tests (4.24s),
changed-file ESLint exited 0, and Nx `typecheck` passed again.

## Slice 2 checkpoint — panel overlay, 2026-10-12

Branch `batch-10/attempt-marks-next` starts at #374
`2065563ca6677b0f01ef4c377243e8f0307063a9`. Axis prerequisite helper checkpoint
`1e5405a8f0dd25b4a0150b9abdc15dc79d637729` was normally merged as `3669ea3b1`;
additive end-of-file geometry/test conflicts and an older verify note were resolved by
retaining both implementations and the complete attempt verification history. Its 216
geometry tests passed after resolution. Axis panel checkpoint
`060f34e452f87458bcf21275419bfa44bd3569a1` was normally merged conflict-free as `6b89ae63b`.
No main merge or release has occurred.

The real panel now draws attempt marks and actual hatch/dot/solid/open-edge paint above
forecast slices. `gantt-attempt.tsx` owns extracted mark, pattern and original-instant card
components. The same translated projection feeds forecasts, hit surfaces and calendar
headers. Attempt identities participate in the axis's shared pointer map and collision
chooser; selected attempts open their own cards. Missing calendar fields render the specified
messages. One panel clock reading feeds every running mark; an explicit `now` participates
in memoization. Export clones the actual marks and definitions with the same translated axis.

The first panel RED run observed five failures and one unchanged-day pass. Expanded RED
coverage observed nine failures/two passes before panel wiring. Interaction RED then caught
forecast-to-attempt card clearing and a 7.84px vertical hit surface; both were corrected.
The final component suite also covers completed leaves, changed attempt history, malformed
start/zone/instant containment, translated selection geometry and exported marks. Tests live
in a dedicated `gantt-attempt-panel.test.tsx` at the real panel boundary, with the zoned
card oracle in `gantt-attempt.zoned.test.tsx`.

| Command                                                                        | Observed result                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `BUN_TMPDIR=/tmp bun install --frozen-lockfile`                                | 1,573 installs checked, no changes, exit 0                         |
| UTC Vitest geometry/input/panel/attempt-panel/detail suites, serial one worker | 540 passed, 5 files, 19.82s                                        |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck`     | Module checks and root build passed, 6.5s                          |
| Direct changed-file ESLint                                                     | Exit 0 after import ordering, clock purity and test callback fixes |

Initial typecheck caught a test date parameter inferred as one literal; its type was widened.
Initial ESLint rejected `Date.now()` in render. The panel follows the existing `new Date()`
clock convention and passes its millisecond value down; geometry still never reads a clock.

| Check                 | Injected fault                                                 | Production-path observer                                                               | Observed                                                              |
| --------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Actual paint          | Swap hatch/dot URL mappings, leaving outcome attributes intact | `paints all four outcomes with hatch strokes, dots, solid fill and an open right edge` | Exit 1                                                                |
| Original project zone | Omit formatter `timeZone` under `TZ=America/Los_Angeles`       | Real extracted `AttemptCard` overnight zoned test                                      | Exit 1; rendered Aug 3 06:30–16:10 instead of Aug 3 16:30–Aug 4 02:10 |
| Missing start         | Substitute a date for absent panel start                       | Both missing-start panel states                                                        | Exit 1, two failed                                                    |
| Missing zone          | Substitute UTC for absent zone                                 | Both missing-zone panel states                                                         | Exit 1, two failed                                                    |
| Translated hits       | Omit translated `mark.x` from the hit surface                  | `aligns translated headers, forecast and attempt hit surfaces`                         | Exit 1                                                                |
| Clock memo            | Omit `before.now === after.now`                                | `uses the supplied clock and repaints a new clock through memoization`                 | Exit 1                                                                |
| Shared chooser        | Remove the attempt collision branch                            | `includes a tick and its forecast in the shared collision chooser`                     | Exit 1                                                                |
| Vertical pointer size | Original 0.28-row height                                       | `gives a two-minute attempt an 18px pointer surface in both dimensions`                | Failed at 7.84px before correction                                    |

All temporary mutation faults were restored. Adjacent `Proof:` comments name the observations.
The attempt hit explicitly targets its fill, matching the axis worker's browser discovery
that an SVG hit rect's stroke footprint can exceed its bounding box. An attribute regression
was watched failing before this explicit targeting was added. Pointer movement rechecks the
shared collision membership after the hover delay.

### Still open

- The new `e2e/gantt-attempts.spec.ts` fixture includes three attempts on one slice, all four
  outcomes, a completed row, a two-minute tick and an attempt before the forecast. It has not
  been run. Browser acceptance and the browser translation mutation remain open until the
  estimate-units prerequisite integrates, per the coordinator's instruction.
- Full fe-01 component/zoned suites, existing Gantt browser shards, full format/lint/build,
  host gate and attempt-inclusive performance measurement have not been run for this checkpoint.
- Tasks 2.2, 2.3 and 3 remain open; production overlay coverage does not claim browser or
  release acceptance. The host gate is reserved for the reviewed integration SHA.

Final checkpoint checks after explicit fill targeting and pointer-move support:

| Command                                                  | Observed result            |
| -------------------------------------------------------- | -------------------------- |
| UTC dedicated attempt panel suite                        | 17 passed, 4.94s           |
| `TZ=America/Los_Angeles` dedicated zoned card suite      | 1 passed, 1.93s            |
| Nx `typecheck` with daemon/plugin isolation disabled     | Passed, 9.2s               |
| Nx `lint:fast` with daemon/plugin isolation disabled     | Passed, 1m 16s             |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json` | 184 items passed, 0 failed |
| `git diff --check`                                       | Exit 0                     |

Axis pointer correction `62b8a24527fa0a6e2c6b55c5bb45f11de8970afa` (#376) was then normally
merged as `892ab20e38865a15078c79a47a417c2f65fc388e`. The one hover-handler conflict retained
the axis's extracted pointer-over/pointer-move handler and the attempt card clearing behavior.
Both verification histories remain intact. Post-merge combined focused suites passed **544**
tests in 21.25s, and Nx module/app typecheck passed in 5.7s; merge commit format/lint hooks passed.

The isolated Chromium driver was rerun against this merged checkout's own Vite server on
4337: `bun apps/wbs/fe-01/e2e/subday-axis-benchmark.ts`. It verified a 3.99992px forecast fill,
17.99992px × 18px pointer surface, exact two-minute card, explicit overlapping-mark choice,
and the production oversized-plan refusal, with no browser errors. This is synthetic
panel-boundary evidence, **not** minutes-input or attempt fixture acceptance. Its capped
500×5 measurement contains no attempts and does not satisfy task 3.2. Output is
`/tmp/attempt-browser-hit.log`; the separate axis verification history contains the observed
browser negative. The attempt fixture's pointer aims within the actual overlap, and its
chooser locator is scoped to the chooser card; the fixture remains unrun.
