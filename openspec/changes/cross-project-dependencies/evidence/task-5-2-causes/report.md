# Task 5.2: mounted scheduling-cause fanout

Bounded acceptance at base `935a981b5`; production code is unchanged and task
5.2 remains open.

`cross-project-causes.controller.db.test.ts` drives the public composed backend
with migrated SQLite, activated organizations and synthetic stored external
relationships. Dependency authoring remains dormant. A → B → C has no shared
people; a separate foreign organization has its own edge and an unrelated local
project is disconnected. Each cause is exercised independently in isolated and
shared capacity modes:

- A new three-point estimate through project commands.
- A calendar anchor through project PATCH (`startDate`).
- A team capacity statement through project commands.
- A persisted optimized selection switched back to Fast through PATCH.
- The objective switched from Pri to Time through PATCH.

Every case requires exactly one durable `elsewhere_changed` envelope addressed
to B and C with A as cause, zero such envelopes for A, both foreign projects and
the disconnected project, no extra event when repeating the same write, and
unchanged complete external-dependency rows. The engine fixture represents an
existing persisted setting on a backend without an optimizer; it does not prove
optimizer enablement or installed solver operation.

## Watched production faults

The isolated clone temporarily changed production code, ran the mounted tests,
required an assertion failure, and restored the original file in `finally`.
No injected fault remains in the commit. Adjacent test `Proof:` comments name
these faults.

| Fault                                                            | Observed failure                                                     | Receipt                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| Replace captured scheduler input hash with a constant            | Missing B events for estimate and capacity in both modes; 4 failures | [input hash](fault-input-hash.log) |
| Replace captured `startDate` with null                           | Missing B events in both modes; 2 failures                           | [calendar](fault-calendar.log)     |
| Replace captured `scheduleEngine` with Fast                      | Missing B events in both modes; 2 failures                           | [engine](fault-engine.log)         |
| Replace captured `scheduleObjective` with Pri                    | Missing B events in both modes; 2 failures                           | [objective](fault-objective.log)   |
| Traverse only the original cause instead of the pending frontier | Missing C events for all five causes in both modes; 10 failures      | [frontier](fault-frontier.log)     |

## Verification

Receipts normalize line endings and strip trailing whitespace.

- `bun test ./apps/wbs/be-01/src/controller/cross-project-causes.controller.db.test.ts ./apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts --timeout=10000`: 19 pass, 0 fail, 290 assertions. [Receipt](final-tests.log).
- `NX_DAEMON=false bunx --no-install nx run wbs-be-01:lint --skip-nx-cache`: exit 0. [Receipt](lint.log).
- `NX_DAEMON=false bunx --no-install nx run wbs-be-01:typecheck --skip-nx-cache`: exit 0, including the module check. [Receipt](typecheck.log).
- `bunx --no-install prettier --check apps/wbs/be-01/src/controller/cross-project-causes.controller.db.test.ts openspec/changes/cross-project-dependencies/evidence/task-5-2-causes/report.md`: exit 0. [Receipt](format.log).
- `bunx --no-install openspec validate cross-project-dependencies --json`: valid, zero errors; existing long-requirement warnings remain. [Receipt](openspec.json).

This packet proves backend durable publication for the named causes. It does not
claim changed schedule dates, full calendar/capacity matrices, actual gateway
socket/browser delivery, topology replacement, rollback faults, live activation,
a build or a canonical isolated host gate. Existing completion/rank/label/commit
and rollback controls were rerun in the companion event suite; topology work is
being handled separately. The parent task and release acceptance remain open.

Independent Astra High review approved the bounded packet without a Critical or
Important finding and reran 19/19 with 290 assertions. After integration, the
case names distinguish isolated and shared mode, and the repeated write
reasserts source, foreign and unrelated silence. The causes, prior event and
topology suites then passed 20/20 with 359 assertions; changed-file ESLint and
Prettier passed. These refinements add no production guard and do not expand the
original five watched fault claims.
