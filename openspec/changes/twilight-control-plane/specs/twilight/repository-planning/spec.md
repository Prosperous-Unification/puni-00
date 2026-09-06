## ADDED Requirements

### Requirement: The factory uses the client repository contract

`puni-00` and client repositories MUST use the same versioned Nx repository
template/workflow contract. Client projects, OpenSpec, knowledge and planning
files MUST belong to that client's repository. Factory self-improvement MUST
use the same review and release controls as other repository changes.

#### Scenario: Create a fresh client repository

- **WHEN** an authorized operator instantiates the tested template version
- **THEN** its orientation, schema, knowledge links, Nx gate and repository
  identity validate without personal home-directory dependencies or puni content

#### Scenario: A run proposes to weaken its own gate

- **WHEN** a factory improvement changes a mandatory judge rubric or policy
- **THEN** the current run remains judged by its pinned external policy and the
  proposed change requires its own controlled promotion; current revocations and
  tighter safety floors continue to constrain admission and effect dispatch

### Requirement: A planning revision has one owner

Before the planning bridge exists, the OpenSpec task artifact MUST remain the
single authored plan. The target architecture MUST use per-repo Backlog.md behind
WBS as authoritative planning storage, with deterministic revision-bound task
exports. Execution checkpoints and leases MUST remain distinct from planning.

Each source candidate MUST pin a versioned change-keyed map of plan references,
export digests/paths and immutable input receipt snapshots. Snapshots MUST contain
only accepted prior receipts and their integration status; missing/unreadable
snapshots MUST fail validation, with an empty snapshot represented explicitly.
New completion receipts MUST be accepted after their named source candidate exists,
as its outputs. They MUST NOT be pinned back into that same candidate. CI MUST
resolve the pinned inputs without consulting a moving planning/receipt head.

#### Scenario: Export and edit diverge after bridge cutover

- **WHEN** a generated task artifact differs from its accepted Backlog/WBS revision
- **THEN** verification refuses the divergence and requires import or regeneration,
  instead of executing whichever copy an agent encountered first

#### Scenario: A predecessor is complete only on another branch

- **WHEN** its completion receipt names a source candidate not integrated or
  composed into the dependent activity's source basis
- **THEN** admission refuses to treat that predecessor as available, even if a
  Backlog status says Done

#### Scenario: Planning advances during source verification

- **WHEN** a source candidate's CI runs while newer planning commits are accepted
- **THEN** it verifies the exact plan and receipt revisions pinned by its plan
  lock instead of reading the moving branch head

#### Scenario: A candidate produces its own completion receipt

- **WHEN** candidate C is verified using prior receipt snapshot R and its new
  completion receipt names C
- **THEN** C and R remain unchanged; the output is accepted separately and may be
  consumed by a later candidate, without a commit/receipt hash cycle

#### Scenario: Independent changes merge into one source candidate

- **WHEN** branches with disjoint change IDs, plan references and task exports
  merge on a compatible source basis
- **THEN** the merged lock preserves both entries, validates each pinned export
  and snapshot, and verifies the new candidate before candidate-bound approval

#### Scenario: Plan lock entries cannot be safely composed

- **WHEN** the same change key has competing plan/snapshot references or the
  merged source basis or cross-plan dependencies are incompatible
- **THEN** merging refuses automatic acceptance and requires explicit reconciliation,
  regenerated exports and affected verification/approval

### Requirement: WBS storage replacement has a gated migration contract

The Backlog/WBS adapter MUST be implemented only against an identified landed WBS
refactor interface. Its migration MUST preserve the complete WBS planning model,
atomic batches, stable identity, conflict-aware undo, and actor/history semantics
or explicitly specify any accepted contract change before cutover.

#### Scenario: A multi-file command is interrupted

- **WHEN** the planning writer crashes between preparing files and publishing a revision
- **THEN** readers see either the entire prior plan or the entire accepted new
  plan, with no mixed revision and no duplicate command on recovery

#### Scenario: Native Backlog editing changes a display ID

- **WHEN** a task is archived, restored, renumbered or assigned a reused Backlog ID
- **THEN** its stable planning identity and historical evidence cannot bind to a different task

#### Scenario: Two clones propose edits from one planning revision

- **WHEN** both attempt to publish against the same accepted revision
- **THEN** only one publishes and the other receives a conflict requiring explicit
  reconciliation; local lock success cannot imply global acceptance

#### Scenario: Two disjoint plans race on the accepted ref

- **WHEN** separate plans in one repository publish against the same accepted ref
- **THEN** one publishes and the other receives 409 even though their files are
  disjoint; explicit reconciliation and a new command against the current revision
  can preserve both edits without silently changing the losing command's basis

#### Scenario: Cutover comparison loses an estimate

- **WHEN** export/round-trip comparison finds a missing estimate, ordering value,
  reference, capacity rule, command history, or other required planning field
- **THEN** cutover is refused and the current backend remains authoritative

### Requirement: Planning storage meets a measured workload budget

Before accepting the proposed Git transaction design or switching WBS authority,
Task 9 MUST execute the pinned workload and proposed numerical budgets in
[client repository storage acceptance](../../../../../../docs/twilight-structure/client-repositories.md#storage-workload-acceptance-budget).
Evidence MUST include package/host/fixture identity, command/conflict counts and
latency distributions. These budgets are proposed requirements, not measurements.

#### Scenario: Storage preserves fields but misses its latency budget

- **WHEN** the full workload round-trips losslessly but any specified acceptance
  budget is exceeded
- **THEN** storage acceptance and cutover remain blocked pending measured improvement
  or an explicitly revised contract, without substituting SQLite planning authority
