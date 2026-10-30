# Task 7.3 bounded mounted interleaving and stage-state acceptance

2026-10-23. Isolated clone `/tmp/puni-73-interleaving`, base
`025c5ac9446b59d193e977e8830aa29332ae3c47`. Production behavior is unchanged.
Parent 7.3 stays open; this packet does not close 7.4 or 8.4.

## Acceptance boundary

Eleven new cases in `apps/wbs/be-01/src/services-connected.db.test.ts` use the
installed service composition, migrated real SQLite, one borrowed read snapshot,
the actual connected resolver/Fast engine/selector, the strict connected durable
encoder and reader, and mounted project work-item routes. No alternate scheduler
or production abstraction was added.

Two projects each have a one-person project-scoped team and two priority-one
work items. A has design and test steps; B has a build step. All A designs precede
all B builds, and all B builds precede all A tests. Thus the project graph returns
to A while the actual slice graph is acyclic. Equal ranks exercise the bytewise
A-before-B tie; a separate changed-rank case visits B before A and invalidates
old question identities.

Fast starts, in long/short order, are A.design `[0,2]`, B.build `[3,5]`,
A.test `[6,7]`. Strictly encoded Pri candidates select A.design `[1,0]`,
A.test `[7,6]`, then B.build `[4,3]`. The literal final starts prove both changes
survive the later stage. Time alternatives contain the original local placement
and are ready beside Pri for the same immutable canonical stage bytes. Switching
B to Time preserves its original `[3,5]` starts. Each stage record occurs once;
repeated mounted reads retain exact settled placement, stage bytes and hashes,
and launch no children. Both project URLs expose their expected final starts and
stage-specific hashes. A mounted read opens exactly one read connection.

B's later stage records A's already-selected short design at 0; A's retained
earlier stage still records B's short build at 5 although final B short build is 3. Comparison/proof identity therefore stays at its original boundary rather
than claiming final-boundary or global optimality.

Fast and disabled B retain the exact A-selected composite. Enabled Fast still
observes ready alternatives; disabled B has no observation. Idle, pending,
failed, corrupt and boundary-infeasible Pri each retain that same complete valid
composite, including earlier A choices, while B Time remains ready. Mounted B
reads expose the expected state and unchanged build starts. Pending is produced
by actual mounted B admission with a held test child; boundary-infeasible is
produced by that child's synthetic terminal response and normal durable
publication. Its retained question matches the exact B stage, and rereads do
not launch a second child. This exercises lifecycle/state projection, not an
actual CP-SAT proof of infeasibility: this fixture's real stage is feasible.
The quantized empty-window solve obligation remains in the existing 7.2 packet.
Holding all B work removes its slices and stage, and no B child is requested.

## Watched production faults

Each mutation below was applied alone, its named production-path test exited 1,
and its source was restored before the next mutation. Temporary logs are
`/tmp/73-faults/<name>.log`; `run.py` in that directory records the seven original
mutations. They are local execution artifacts, not dependencies of the tests.

Unless named otherwise, the command was:

```sh
bun test apps/wbs/be-01/src/services-connected.db.test.ts -t 'mounted interleaving selects' --timeout 10000
```

| Fault                                                                                                                      | Observed red assertion                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `original-fast`: build every stage from `baseline` instead of current `placement`                                          | A designs become `[0,2]` and tests `[6,7]`, instead of selected `[1,0]` and `[7,6]`, after B replacement. Both stage choices still reported optimized; actual dates catch the loss. |
| `wrong-objective`: use `observed.decisions.time`                                                                           | Expected Pri starts are replaced with Fast/Time starts, including B short build 5 instead of 3.                                                                                     |
| `ignore-enablement`: remove `member.enabled` from the observation guard; run `-t 'mounted interleaving disabled'`          | Disabled B moves to the cached Pri placement; complete composite equality fails.                                                                                                    |
| `replace-fast`: remove the selected-engine guard; run `-t 'mounted interleaving fast'`                                     | Fast B moves to Pri; complete composite equality fails.                                                                                                                             |
| `double-visit`: loop over `[...members, ...members]`                                                                       | Actual stage IDs become `[a1,a2,a1,a2]`, expected `[a1,a2]`.                                                                                                                        |
| `final-stage-substitution`: replace retained `selected.stages` starts/finishes with final placement in `connected-plan.ts` | Earlier A canonical stage bytes change to B's final starts/finishes; immutable-stage byte assertion fails.                                                                          |
| `inverted-sort`: reverse rank and ID comparator in selector                                                                | Mounted stage IDs become `[a2,a1]`, expected `[a1,a2]`.                                                                                                                             |

The seventh required omission obligation was independently checked using
`bun test libs/wbs/application/core/src/service/connected-optimization.test.ts -t 'visits rank then'`.
Replacing selector sorting with `[...prepared.projects]` (`omit-sort.log`) made
actual visits `[C,B,A]`, expected `[A,B,C]`. Mounted derivation already sorts
members upstream, so omitting only the selector sort is redundant there. The
mounted inverted-sort failure is complementary evidence, not a claim that an
isolated mounted sort omission was observed red.

## Fresh checks

- Final new-case focused run: 11 pass, 0 fail, 169 assertions.
- Before the final extra mounted-state assertions, complete mounted plus selector
  suites: 69 pass, 0 fail, 515 assertions.
- Final configured `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
wbs-be-01:test --args='src/services-connected.db.test.ts' --skip-nx-cache`:
  31 pass, 0 fail, 447 assertions; coverage enabled by the configured target,
  39.3s. This runs the complete mounted file, including displaced-stage controls.
- Final changed-file ESLint passed with the Nx project graph available.
- Final configured `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
wbs-be-01:typecheck --skip-nx-cache`: passed, including all three module
  checks, 20.9s after the last test edit.
- `openspec validate cross-project-dependencies --type change --json`:
  valid, 0 errors; existing long-requirement warnings remain.
- Changed-file Prettier check and `git diff --check`: passed.
- Configured `NX_DAEMON=false bunx nx run wbs-be-01:lint`: passed, uncached,
  1m21s. Nx reported restricted plugin sockets and fell back to the main process.
  The initial standalone changed-file lint had skipped module boundaries before
  Nx built its project graph; that initial run is not the configured lint proof.
- Configured backend typecheck, including optimization, launcher and supervisor
  module checks: passed, uncached, 23.9s before final extra test assertions.

No production source defect was exposed; there was no implementation patch to
make green. Initial acceptance failures corrected fixture expectations (admit B
through B's URL; a valid equal Time candidate may be labeled optimized while
retaining identical dates). The observed regression evidence consists of the
independently injected production faults above and restoration to green.

Full backend/store suites, build, host/CI gates, actual installed image solver,
Python reinstall/solve, deployment and activation were not run in this packet.
Dependencies are borrowed through an ignored node_modules symlink to the primary
checkout. Existing displaced-stage live-admission and Retry proofs remain in the
same mounted file. No browser 5.2 files changed.
