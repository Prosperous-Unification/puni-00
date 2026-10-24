# Task 6.3 slice 1: mounted governed admission

2026-10-23. Isolated checkout `/tmp/puni-63-admission` starts at
`927e8c79594fe9df4c694d18a0171bd9ebec7ae8`. This packet changes only the
mounted startable test and this evidence directory. It reuses installed
execution eligibility and adds no production behavior or activation authority.
Parent task 6.3 remains unchecked; no gateway task 5.2 work is included.

## Mounted acceptance

`cross-project-startable.controller.db.test.ts` now has 27 tests. The added
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
remain unchanged and publication is silent. After a new admissible claim,
release/undo under the now-unsatisfied upstream prerequisite restores the same
claim identity, including its original creator; a restoration timestamp is not
part of that identity assertion. Separately, explicit manual continuation permits
a new claim under the unmet prerequisite. That new claim is checked for its
target, step, executor and progress, without claiming it reuses the released
claim's identity. Manual correction policy is preserved.

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

## Review corrections and actual shared-person bridge

The independent Astra High review approved the original bounded packet and
identified three minor evidence corrections. The expanded-pair Proof comment
now states only the observed false advertisement; the watched fault stopped
before claim admission. The history description above separates the stable
release-undo claim identity assertion from the independently accepted new
continuation claim. The three affected original receipts (`configured-lint.log`,
`configured-typecheck.log`, `new-start-admission-fault.log`) now use LF line
endings without trailing whitespace; tokenized contents are unchanged.

The earlier two-mode matrix only toggled the capacity mode; it did not contain
shared assignments. Three additional mounted FS/SS/FF cases now construct this
actual topology in shared mode:

```text
Predecessor B --authored selected-step FS/SS/FF--> Target A
Target A     --same assigned executor---------- Shared peer C
```

A's first step and C's first step have separate persisted assignment rows for
the same `executor`. C has its own project, first step and ready leaf and no
authored dependency. The only external row remains B→A. A query witness on the
actual read-only connection asserts that mounted `/startable` captures attempt
evidence for exactly A, B and C, proving that C joins through the person bridge.
FS and SS initially advertise no target and refuse its claim with all-table
invariance and zero publication. FS completion and an SS ended failed attempt
release A; accepted claims persist its step progress. FF permits the claim and
reports its unmet finish condition. These assertions cover execution eligibility
with a real bridge, rather than asserting that shared capacity is itself a
prerequisite.

No new production predicate was added. An additional watched production fault
replaced `if (mode !== 'shared') continue` with `if (true) continue` in
`discoverConnectedTopologyIn`, independently removing person traversal. All
three mounted tests exited 1 because C's project ID was absent from the captured
attempt-query projects ([shared-bridge-fault.log](shared-bridge-fault.log)). This
fault proves the topology witness, not a different FS/SS/FF admission policy.
The production file was restored before the final run.

The restored focused command listed above now passes **112 tests with 551
assertions** ([focused-bridge.log](focused-bridge.log)). The three bridge cases
alone passed 3/3 with 49 assertions ([shared-bridge.log](shared-bridge.log)).
Configured backend lint and typechecking both exited 0 for this addition; their
receipts are [bridge-configured-lint.log](bridge-configured-lint.log) and
[bridge-configured-typecheck.log](bridge-configured-typecheck.log). Changed-file
Prettier exited 0 ([bridge-format.log](bridge-format.log)). The committed-range
whitespace check uses:

```sh
bunx prettier --check apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts openspec/changes/cross-project-dependencies/evidence/task-6-3-admission/report.md
git diff --check 927e8c795 HEAD
```

Parent task 6.3 remains open. The original packet's stated CI, host gate, build,
browser/socket, activation and completion-policy limitations still apply.
