# Task 6.3 slice 1: mounted governed admission

2026-10-23. Isolated checkout `/tmp/puni-63-admission` starts at
`927e8c79594fe9df4c694d18a0171bd9ebec7ae8`. This packet changes only the
mounted startable test and this evidence directory. It reuses installed
execution eligibility and adds no production behavior or activation authority.
Parent task 6.3 remains unchecked; no gateway task 5.2 work is included.

## Mounted acceptance

`cross-project-startable.controller.db.test.ts` now has 24 tests. The added
matrix covers local and remote FS/SS/FF in both isolated and shared modes.
FS rejects a new claim until upstream completion. SS rejects until an actual
start, including an ended failed attempt. FF admits the claim while exposing
its unmet finish prerequisite. Accepted claims persist the exact target,
step and executor identity and state that step `in_progress`.

The remote mixed-step cases advertise only the permitted first step. Both an
omitted `steps` selection and an explicit permitted-plus-blocked selection
refuse after an earlier staged rename. Every user SQLite table is captured
before and after and compared exactly: row names/revisions, claims, occupancy,
assignments, progress, attempts, journal and durable event/sequencer state all
remain unchanged. The permitted explicit subset succeeds. Refused commands
produce no calls to the installed production push transport; successful claim
controls prove that the publication spy observes real pushes.

Remote claim redo after removal of upstream completion answers `409 stale_undo`.
The existing compensating-history contract deliberately removes the single stale
journal entry through its `afterRollback` repair. The assertion compares every
table against the exact expected state with only `command_journal: []`; it does
not falsely claim journal invariance. Execution, revisions and durable events
remain unchanged and publication is silent. A new admissible claim, a subsequent
release/undo and explicit manual continuation retain claim identity under the
now-unsatisfied upstream prerequisite. Restoration checks stable claim identity,
including original creator, rather than treating a new restoration timestamp as
identity. Manual correction policy is preserved.

A whole-scope predecessor branch expands into two leaf pairs. Completing one
leaf leaves the successor blocked specifically by the other; completing both
advertises and admits the target. Predecessor steps are reduced to one solely in
this fixture so exactly two external pairs are under test.

The suite now awaits `closeComposed()` and checks Linux `/proc/self/fd` for both
live and deleted descriptors belonging to its database path. Its pre-fix witness
failed with six deleted database/WAL/SHM descriptors. The restored focused packet
checks closure after every mounted case. This descriptor witness is Linux-only;
other platforms still execute composed shutdown but do not run the `/proc` check.

## Watched production faults

Each fault was injected independently, run through the mounted HTTP controller,
and restored byte-for-byte before the next fault. No production mutation is
committed. Adjacent test `Proof:` comments point to these receipts.

| Fault                  | Production mutation                                                                      | Observed red                                                                                              | Receipt                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Leaking fixture        | Old `harness.close()` with the descriptor witness installed                              | Six deleted DB/WAL/SHM descriptors; 1 failure                                                             | [teardown-red.log](teardown-red.log)                           |
| Advertised readiness   | Replace the `startable.ts` new-start exclusion with `if (false) continue`                | Both remote FS mode cases advertise the blocked step; 2 failures                                          | [startable-filter-fault.log](startable-filter-fault.log)       |
| New-start admission    | Replace `claim.ts` `!admission.started && !admission.canStart` with `false`              | Remote FS and SS claims answer 200 instead of 409 in both modes; 4 failures                               | [new-start-admission-fault.log](new-start-admission-fault.log) |
| Replay eligibility     | Replace `work-item.resource.ts` replay predicate with `false`                            | Remote redo answers 200 instead of 409 in both modes; 2 failures                                          | [replay-fault.log](replay-fault.log)                           |
| Expanded external pair | Apply `.slice(0, 1)` to external `resolveAuthoredEdges(...)` in `connected-step-node.ts` | The unfinished second predecessor disappears from eligibility and the successor is advertised; 2 failures | [expanded-pair-fault.log](expanded-pair-fault.log)             |

All red invocations exited 1 with assertion failures, rather than import or
startup errors. Their command is:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts --timeout=10000 --test-name-pattern '<pattern>'
```

Patterns in table order after teardown are `remote FS advertised`,
`remote (FS|SS) advertised`, `remote redo revalidates`, and
`whole remote predecessor`. Teardown used `remote unfinished FS`.

## Verification

The final restored six-file packet exited 0: **109 tests, 518 assertions**
([focused.log](focused.log)). It includes the modified mounted suite, coherent
execution observation, startable/resource regressions, connected readiness,
domain execution eligibility and domain claim policy:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-execution-observation.controller.db.test.ts libs/wbs/application/core/src/module/work-item/startable.test.ts libs/wbs/application/core/src/service/connected-readiness.test.ts libs/wbs/domain/domain/src/execution-eligibility.test.ts libs/wbs/domain/domain/src/claim.test.ts --timeout=10000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck
bunx openspec validate cross-project-dependencies
```

Configured backend [lint](configured-lint.log) and
[typecheck](configured-typecheck.log), including its module dependency, exited
0 without a cache hit. The initial lint run caught unsafe Bun asymmetric matcher
values; explicit typed response selection removed those assignments before the
successful configured rerun. OpenSpec exited 0 with the sixteen existing
long-requirement warnings ([openspec.log](openspec.log)); no spec changed.
The separate accepted FS publication control passed both modes
([publication-control.log](publication-control.log)).

Frozen installation required `BUN_TMPDIR=/tmp` because the default temporary
location was read-only; `BUN_TMPDIR=/tmp bun install --frozen-lockfile` exited 0.
Formatting, diff checks and normal commit hooks are recorded with the commit.
Independent Astra High review is requested through the parent after commit.
No full backend coverage suite, CI, host gate, build, browser/socket delivery,
push, merge or semantic activation was performed. This packet does not close
6.3's remaining task-wide evidence or skipped-completion-policy obligations.
