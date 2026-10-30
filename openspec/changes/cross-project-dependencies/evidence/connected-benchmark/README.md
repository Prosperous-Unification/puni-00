# Connected capture and scheduling measurements — task 8.5

Measured 2026-10-22 with Bun 1.4.2 in an isolated `/tmp` clone based on
`b3142dcc0`. These are observations from the retained [live focused run](live-focused.log)
and earlier [snapshot capability run](focused.log),
not a latency or query budget. The synthetic fixtures do not certify production
scale, optimized scheduling, deployment readiness or the remaining live callers.

`connected-benchmark-fixture.ts`, beside the existing domain schedule benchmark,
feeds both `schedule-connected-benchmark.test.ts` and SQLite
`connected-plan-benchmark.db.test.ts`. Each member has one work item and its own
step, estimated at one day. The sparse fixture has 202 projects, 101 directed FS
edges and 100 separate two-project person bridges, alternating along one
component. The dense fixture has a complete directed acyclic graph over 25
projects (300 FS edges), with its 26th member reachable only by a person bridge.
The SQLite fixtures also contain four unrelated same-organization projects and
one foreign-organization project; none enters the required component.

The production live aggregate is exercised through
`createLivePlanStore(...).readAggregate('ada', access)`, which calls
`readConnectedLivePlanIn` and reuses its `connectedByProject` memo. Exact aggregate
entry identities include all required members plus the four unrelated local
projects, with no foreign entry. Every required member shares one connected live
plan, selects its own project metadata and scheduled work item, and has a null
consumer cache basis. The existing `captureRead.afterFirstRead` seam counts one
full-input capture per member; forwarding wrappers around the actual
`captureConnectedPlanIn` and `deriveConnectedPlan` exports count and time one
component capture and one core derivation. The scheduler callback also runs once.
The wrappers forward the original arguments and values and restore in `finally`.
The work-item repository reads each member twice: once for full scheduling inputs
and once for live metadata. Metadata reads are not counted as full captures.

| Fixture | Live aggregate queries | Capture queries | Capture elapsed ms | Core derive elapsed ms | Aggregate elapsed ms |
| ------- | ---------------------: | --------------: | -----------------: | ---------------------: | -------------------: |
| Sparse  |                 13,532 |          10,303 |         985.658011 |              12.123249 |         1,180.340053 |
| Dense   |                  6,464 |           5,897 |         139.149972 |               2.235134 |           178.418501 |

Aggregate timing includes its owned observation, closure discovery, full capture,
core derivation, readiness and metadata assembly for connected and unrelated
local entries, and connection closure. Query totals observe Drizzle statements
on that observation, including live assembly and unrelated local entries; they
exclude native transaction controls. Capture timing/counts enclose the actual
production capture call, and derive timing encloses the actual production core
call. These are single elapsed samples with assertion/logger/wrapper overhead,
collected alongside other focused tests; they establish no percentile or budget.

## Snapshot capability and domain measurements

The earlier lower-level measurements below remain useful for their narrower
scope. The `ChainSnapshot.captureConnected` memo is separate from the live
aggregate memo; its reuse negative alone does not prove production aggregate
reuse. Both memos now have independently watched faults.

The production authorized lookup repository returns at most 25 or 200 projects
for the same fixtures. A connected snapshot starting in the component's middle
captures the entire required set in both incident directions and across person
bridges. Every member's projection reuses the identical captured component, adds
zero queries and preserves its own scheduled work item. The full work-item
repository reader is called exactly once for every required project and never
for unrelated projects. Domain assertions also check every FS inequality and
non-overlap for every person bridge.

| Fixture | Projects | External relationships | Capture queries | All snapshot queries | Capture elapsed ms | Core derive elapsed ms | Domain schedule elapsed ms |
| ------- | -------: | ---------------------: | --------------: | -------------------: | -----------------: | ---------------------: | -------------------------: |
| Sparse  |      202 |                    101 |          10,303 |               10,517 |         565.690243 |              15.396044 |                   1.663706 |
| Dense   |       26 |                    300 |           5,897 |                5,935 |         124.554464 |               1.914040 |                   0.441902 |

Counts come from Drizzle's logger on the actual owned read-only snapshot
connection. Capture counts start immediately before `captureConnected` and end
after it resolves. All-snapshot counts additionally include admission and initial
snapshot setup, sampled before transaction closure. The logger does not observe
native SQLite transaction controls; separate lookup, setup and migration queries
are excluded. Core derive timing includes `deriveConnectedPlan` graph preparation,
Fast scheduling and all project projections; domain timing measures only
`scheduleResolved` after graph preparation. Each is one elapsed sample; no
warmup, percentile claim or newly invented performance threshold is applied.

## Watched production-path negatives

Each fault changed the actual production implementation, ran the SQLite benchmark
and was restored before the final green run. No fault remains in production.

| Fault                                                                                                                                     | Observed negative                                                                                                          | Retained output                          |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| In `captureConnectedPlanIn`, replace the `admittedProjects` full-input iteration with `[...admittedProjects].slice(0, 25)`                | Both completeness assertions fail: sparse omits 177 members; dense omits its person-only final member                      | [25-project cap](page-limit-25.log)      |
| Use `.slice(0, 200)` in that same full-input iteration                                                                                    | Sparse completeness fails with two omitted members; dense remains green                                                    | [200-project cap](page-limit-200.log)    |
| In snapshot capability `captureConnected`, replace `if (held !== undefined) return held` with `if (held !== undefined) connected.clear()` | First repeated projection fails the unchanged zero-query assertion: sparse 20,606 versus 10,303; dense 11,794 versus 5,897 | [Repeated capture](repeated-capture.log) |

The independent live-path fault replaces
`let connected = connectedByProject.get(project.id)` in `readLiveAggregateIn`
with an explicitly undefined connected value. Both sparse and dense tests fail
at the full-capture seam during the second component projection: expected capture
count 1, received 2. The stack traverses `readAggregate` → `readLiveAggregateIn`
→ `readConnectedLivePlanIn` → `captureConnectedPlanIn`. The callback assertion
fails on the first duplicate rather than waiting for hundreds of recaptures.
Output: [live aggregate repeated capture](live-repeated-capture.log). The fault
was restored before [live focused verification](live-focused.log).

Adjacent `Proof:` comments name these faults and observed assertions. This is
regression coverage for existing capture behavior; no new production behavior or
performance guard was introduced.

## Verification

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: successful, locked dependencies.
- `bun test libs/wbs/adapters/store-sqlite/src/connected-plan-benchmark.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-plan-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts libs/wbs/domain/domain/src/schedule-connected-benchmark.test.ts libs/wbs/domain/domain/src/schedule-benchmark.test.ts`:
  48 passed, 1 skipped, 0 failed; 3,086 assertions. The existing opt-in elapsed
  certification is skipped because `WBS_PERFORMANCE_CERTIFY` is absent; its CPU
  benchmark passes. Output: [live focused run](live-focused.log).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck lint --projects=wbs-domain,wbs-store-sqlite --outputStyle=stream`:
  all four targets pass, no cache hits. Disabling daemon/plugin isolation avoids
  sandbox-denied Unix sockets; earlier default invocations emitted warnings
  without executing targets and are not counted as validation.
- `bunx openspec validate --all --json`: 268 of 268 valid (250 changes and 18 specs), none failed.
- Normal installed lefthook pre-commit and commit-message hooks ran successfully
  on the initial commit and run again on the correction commit. The tool-wiki
  command reports inactive/not certified because the external activation root is
  unprovisioned; migration/doc-cap hooks skip inapplicable staged paths.

The full host gate, CI build/secrets/migration checks, frontend suites and
opt-in elapsed certification are not run for this focused test-only slice. They
remain release/integration obligations for the final feature SHA.
