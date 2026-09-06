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
  proposed change requires its own controlled promotion

### Requirement: A planning revision has one owner

Before the planning bridge exists, the OpenSpec task artifact MUST remain the
single authored plan. The target architecture MUST use per-repo Backlog.md behind
WBS as authoritative planning storage, with deterministic revision-bound task
exports. Execution checkpoints and leases MUST remain distinct from planning.

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

#### Scenario: Cutover comparison loses an estimate

- **WHEN** export/round-trip comparison finds a missing estimate, ordering value,
  reference, capacity rule, command history, or other required planning field
- **THEN** cutover is refused and the current backend remains authoritative
