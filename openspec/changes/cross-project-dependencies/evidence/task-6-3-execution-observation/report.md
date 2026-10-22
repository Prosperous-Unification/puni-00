# Task 6.3 bounded mounted execution observation

Base: `a9f022563` (`docs(wbs): record replay OOM evidence`). Isolated shared clone:
`/tmp/puni-execution-observation`. This packet adds two mounted tests and this
report; production files, harness seams and the parent task checkbox are unchanged.
Task 6.3 remains open. No push, deployment or runtime activation was performed.

## Witnesses

`apps/wbs/be-01/src/controller/cross-project-execution-observation.controller.db.test.ts`
uses `OrganizationHarness.openComposedWith({ openReadOnlyConnection })` and the
production `openReadOnlyConnection(path, { logQuery })`. The existing
`seedDependencyAuthority(harness.databasePath())` helper establishes synthetic
stored authority, as in existing connected SQLite/transfer fixtures. It does not
prove runtime capability, participant drainage or authoring admission. Production
activation checks remain in force.

Each project has one leaf and one step, making the complete response expectation
unambiguous. The target is ready and demands the constrained machine's one slot.
The logger is armed only after setup and triggers exactly once, when the remote
project's `step_node_attempt` query is about to execute. A separate writer commits
one atomic transaction. The test verifies durable writer rows even before
asserting the first response, and verifies the injection count again after the
second response.

- FS: remote step is initially done. The writer removes remote completion and
  creates the exact target step claim plus one slot of occupancy. The first
  mounted GET returns eligible/unclaimed/free; the second returns the exact FS
  blocker, target claim and occupied resource.
- SS: remote progress and attempts initially provide no start evidence. The
  writer adds an ended failed attempt and the target claim/occupancy. The first
  GET returns the exact SS blocker, no claims and a free slot; the second exposes
  eligibility from the unsuccessful attempt, the exact claim and no free slots.

Both responses are checked with complete `toEqual` objects, including all leaf,
claim, prerequisite/blocker identity and resource fields. All GETs require 200.
The claim uses the registered user's actual ID and a named holder; it is not a
malformed-row fault.

## Verification commands and observed output

All commands run in the isolated clone with Bun 1.4.2. The clone reuses the
primary checkout's installed `node_modules` by symlink; no dependency installation
or frozen-lockfile reproducibility claim is made.

```sh
bun test apps/wbs/be-01/src/controller/cross-project-execution-observation.controller.db.test.ts --timeout=10000
```

Restored production: **2 pass, 0 fail, 22 assertions**. Receipt:
`/tmp/execution-final-green.log`.

```sh
bun test apps/wbs/be-01/src/controller/cross-project-execution-observation.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.db.test.ts --timeout=10000
```

**37 pass, 7 fail, 286 assertions**, exit 1. Receipt:
`/tmp/execution-regressions.log`. This is not a green regression run.

The independent baseline command excludes the new test entirely:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.db.test.ts --timeout=10000
```

At unchanged `a9f022563`: **35 pass, 7 fail, 264 assertions**, exit 1. Receipt:
`/tmp/execution-baseline.log`. `git diff --exit-code HEAD --` for all three files
and `chain-snapshot.ts` returned 0, confirming they were unmodified. The exact
same seven failures are therefore baseline defects, not introduced by the new
tests:

| Unchanged file                                  | Failing test                                                                                                 | Diagnostic                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cross-project-startable.controller.db.test.ts` | remote unfinished FS is excluded from startable and refused by claim until completion                        | `SQLiteError: external_dependencies_inactive` in setup at external dependency INSERT                                                                                         |
| Same                                            | FF permits start and exposes the unmet finish prerequisite in the startable response                         | Same                                                                                                                                                                         |
| Same                                            | local claim redo reevaluates prerequisites after undo instead of replaying a new start                       | Same                                                                                                                                                                         |
| Same                                            | SS observes ended unsuccessful attempts while unknown prerequisites refuse atomically                        | Same                                                                                                                                                                         |
| Same                                            | local all-step claims keep atomic meaning while explicit first-step claims and release undo preserve history | Same                                                                                                                                                                         |
| Same                                            | manual progress and historical attempts remain observations with unmet local prerequisites                   | Same                                                                                                                                                                         |
| `connected-live-plan.db.test.ts`                | borrowed service claim sees staged remote completion and collects its normal announcement                    | `a bound claim was added under scoped access without organization limits` from `WorkItemService.refuseBoundClaims`, `work-item.resource.ts:3717`, called by fixture line 355 |

The borrowed fixture constructs a scoped service without its organization limits
gauge. Its direct claim call is the minimal reproduction. This packet does not
repair that separate fixture or relax the production guard. The unchanged
snapshot-lifetime suite passes in both runs.

```sh
bunx tsc --project apps/wbs/be-01/tsconfig.spec.json --noEmit
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/execution-project-graph.json
bunx eslint apps/wbs/be-01/src/controller/cross-project-execution-observation.controller.db.test.ts
bunx prettier --check apps/wbs/be-01/src/controller/cross-project-execution-observation.controller.db.test.ts openspec/changes/cross-project-dependencies/evidence/task-6-3-execution-observation/report.md
git diff --check
```

Backend spec TypeScript, generated Nx project graph, changed-test ESLint,
changed-file Prettier and whitespace check exit 0. An initial lint run correctly
rejected a shorthand void-returning teardown; braces repair it. The initial run
also reported missing Nx graph. The first graph command encountered denied daemon/plugin sockets and produced no graph despite exit 0. Repeating with daemon and plugin isolation disabled produced the JSON graph and cached project graph; final lint runs after that fresh evidence.

## Watched R5 fault and reproduction

Receipt: `/tmp/execution-transaction-fault.log`. Temporarily replace only the
owned `observe` transaction in
`libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts`:

```ts
const transaction = { begin() {}, commit() {}, rollback() {} };
```

The original line is `const transaction = drizzleReadTransaction(connection.db);`
inside `createLivePlanStore`'s `observe` function. Keep lifetime expiry,
`finally`, connection closure and all other methods intact. Run the two-case
command above, then restore the original line and rerun it.

Observed fault: **0 pass, 2 fail, 16 assertions**, exit 1. Both mounted calls
pass their HTTP 200 assertions and durable-writer checks, then fail the first
response equality. Neither failure is a 500 or an exception from the writer.

- FS combines old remote completion (`canStart: true`, no blocker) with the new
  target claim and resource occupancy (`occupied: 1`, `free: 0`). This is a mixed
  execution response across the atomic writer commit.
- SS exposes the new failed-attempt start evidence (`canStart: true`, no SS
  blocker) and new claim/occupancy in the first response, which had already
  captured the older progress evidence. The promised old snapshot should retain
  `canStart: false` and the exact SS blocker. This demonstrates the first
  observation admitting later facts; unlike FS, its projected fields happen to
  agree with the new committed state.

Production `chain-snapshot.ts` was restored byte for byte before the green run;
`git diff --exit-code HEAD -- libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts`
returns 0. The adjacent production `Proof:` comment is reserved for the integrator
after independent review; none is added in this test-only packet.

## Limits

This establishes the two bounded mounted snapshot witnesses and their observed
transaction fault only. Full task 6.3 evidence, missing/hold/edge evidence faults,
all governed admission consumers, shared-mode/full mounted/browser and MCP
acceptance remain outside this packet. Full CI, OpenSpec-wide validation and the
canonical exact-SHA host gate were not run. The seven reproduced baseline
failures remain open; no broad regression success is claimed.
