# Ready initial-handoff cleanup verification

Baseline `6218d50bba445c70247d3714525a1a93eab98eeb`. The bounded decision is [ready initial-handoff cleanup](design.md#bounded-ready-initial-handoff-cleanup--2026-11-08). Production scope is only `edge-ownership.ts` and `complete-dependency-exclusion.ts`: no storage, Graph, native constructors, broad R2 overlay or later capsule is changed.

## Genuine original RED/GREEN

The unchanged ordinary storage selector `^UC2 original drop (live|expired) closes genuine raw originals at owner return$` first failed **0 pass/2 fail,266 assertions in156.83s**, at the original-closed-once assertion before fixture fallback. Original output: `/tmp/puni-ready-drop-evidence-20261108/existing-drop-red.log`.

Removing only successful-mint ready enrollment from the actual production complete module then failed the unchanged genuine `drop live` consumer again: **0 pass/1 fail,133 assertions in52.69s**. It reached the intended `Expected:true / Received:false` original-closed-once oracle, not setup/parser or timeout. Source was exactly restored before the SAME consumer and all its live/expired drop/release controls ran: **4 pass/0 fail,540 assertions in234.73s**. All native case annotations remained180000ms; the Bun default was30000ms, unchanged. No close fault was injected into a native original.

Commands use `bun test ./tools/tool-remote-scripts/src/lib/dependency-activation-storage.test.ts --test-name-pattern '<selector>' --timeout=30000`. The restoration selector is `^UC2 original (drop|release) (live|expired) closes genuine raw originals at owner return$`. Full commands/exits and both logs are in `/tmp/puni-ready-drop-evidence-20261108/actual-enrollment-proof.json`, `enrollment-omission-red.log` and `actual-four-green.log`. Fixture fallback remains failed-test containment; it is not counted as application cleanup success.

## Finite actual-source lifecycle controls

`ready-cleanup.model.test.ts` executes the current production owner lifecycle and actual consume body using inert lock/timer/IO/close ports. It acquires no real native resource and never executes genuine UNKNOWN/HOLD. It covers callback value/failure/undefined identity, close-before-expiration/unlock order, successful discharge, explicit release exactly once, actual consume transfer before its first pending read, foreign owner rejection, before/after-delegation simulation and explicit-release UNKNOWN, independent sibling cleanup, exact original primary/cleanup/diagnostic cause identity, referenced keeper retention, no retry, no forward IO during UNKNOWN and post-await owner liveness.

The delayed publication-read control first failed because an owner assertion resolved after its owner expired. Adding exact post-await owner/state revalidation made the SAME control pass. The final combined ordinary owner/model command, `bun test ./tools/tool-remote-scripts/src/lib/ready-cleanup.model.test.ts ./tools/tool-remote-scripts/src/lib/edge-ownership.test.ts --timeout=30000`, passed **86/0 with429 assertions in4.56s**: all75 unchanged owner cases plus11 finite controls. The original whole owner run independently passed75/0/336 in3.00s. Final log: `/tmp/puni-ready-drop-evidence-20261108/final-owner-model.log`.

## Watched finite production dependencies

Fifteen separate actual production omission/restoration pairs reached genuine owning assertion failures and then passed after exact restoration, with no timeout/parser/setup credit. Every selected consumer executes the actual source cut, not a rewritten decision algorithm. Original cases/commands/exits and raw streams are `/tmp/puni-ready-drop-evidence-20261108/model-proof-pairs.json` and `model-{mutant,restored}-*.log`.

| Injected fault                                 | Observed finite owning failure                                        |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Delete owner before ready sweep                | Expected known close; observed retained refusal before original close |
| Omit successful discharge                      | Ready census remained1 instead of0                                    |
| Omit transfer in actual consume body           | In-flight inert preparation closed1 time instead of0                  |
| Omit UNKNOWN hold                              | Original owner was discarded and inert locks unwound                  |
| Omit original callback-outcome retention       | Original primary cause was absent                                     |
| Omit diagnostic-failure retention              | SAME diagnostic cause was absent                                      |
| Re-enter an already UNKNOWN entry during sweep | Original cleanup cause was replaced                                   |
| Omit pre-read active-state refusal             | Publication IO entered during UNKNOWN                                 |
| Omit post-read owner/state revalidation        | Original assertion resolved after owner expiration                    |
| Omit exact entry/owner association             | Foreign owner entered original close                                  |
| Omit enrollment state guard                    | New entry admitted during UNKNOWN                                     |
| Omit transfer state guard                      | UNKNOWN owner custody was discarded                                   |
| Omit release one-shot guard                    | SAME inert original close entered twice                               |
| Omit keeper arming                             | Referenced original owner callback was absent                         |
| Arm a new keeper for every entry               | First inert timer remained uncleared after known owner exit           |

Adjacent Proof comments name only these observed scopes. Inert port observations do not prove genuine native UNKNOWN settlement, consumed-operation custody or the full39 matrix. Only fixture-owned inert objects are retired after model observations.

## Checks and integration limits

- Own isolated `bun install --frozen-lockfile`: exit0, Bun1.4.4.
- Scoped ESLint on the two production paths and new model: exit0 with populated Nx graph. Initial formatting/void-arrow/async narrowing and model typing issues were repaired; no skipped graph warning is counted as final policy verification.
- Configured `NX_DAEMON=false bunx nx run tool-remote-scripts:typecheck --output-style=stream`: exit0, uncached task,8.2s.
- Post-proof source reconciliation changes are comments, import ordering, braced void callback, optional-chain/nullish initialization spelling and a fresh local alias for the SAME post-await WeakMap read; native control behavior is unchanged. Final source still requires exact aggregate CI/gates.

All69 existing storage test bodies, their discovery and native annotations remain unchanged. Per coordinator sequencing, another local hour-long full69 run is deliberately not started: the single final aggregate's complete required CI and canonical exact-SHA host gate must execute it. No test is skipped/quarantined and this unit does not claim full suite or release readiness.

Independent final frozen source/evidence review found no behavior blocker. Final OpenSpec validation is valid with no warnings for the new ready requirements; `git diff --check` and an exact comparison of the storage69 file/discovery/config against6218 exited0. Source remains unchanged except JSDoc wording clarified that forward authority revokes before cleanup; no test rerun is attributed to that wording. Normal commit hooks are recorded at handoff. No semantic activation, live store/reader/service mutation, remote push/merge or deployment occurred in this unit.
