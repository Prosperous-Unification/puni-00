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

### Requirement: Plan resource units are carried without conversion

A `WorkPlan` read through the planning port MUST carry each task's resource units
in the ledger vocabulary (human minutes, additive agent time, tool time, token
categories, money categories and concurrent slots) beside WBS workdays. Each value
MUST retain its unit, uncertainty and measured or unavailable status. Twilight MUST
reserve and report against those units without converting one into another. Run
wall elapsed, queue wait and human wait MAY be reported as distinct progress
observations but MUST NOT be substituted for task effort. Settled usage MUST return
to the planning owner as a progress receipt naming its run, attempt and profile
epoch, never as an edit of the approved task definition.

#### Scenario: A plan states workdays only

- **WHEN** a task carries a WBS workday estimate and no agent or token estimate
- **THEN** the port reports those units as absent, admission treats the agent budget
  as unknown under the profile's budget policy, and no workday is converted into tokens

#### Scenario: Measured usage returns to the plan

- **WHEN** an activity attempt settles with measured token categories and agent time
- **THEN** a progress receipt naming the task, run, attempt and profile epoch is
  proposed to the planning owner, and the approved task definition's revision is unchanged

#### Scenario: Parallel attempts update one task estimate

- **WHEN** four 30-minute agent attempts overlap during one 30-minute run interval
  and their progress receipts are aggregated for the task
- **THEN** the plan records 120 agent-minutes and 30 minutes of run wall elapsed as
  distinct quantities; neither is converted into WBS workdays
