## ADDED Requirements

### Requirement: WBS is the coordinator's only store

The coordinator SHALL persist nothing about a run outside WBS: admission is a WBS claim and
attempt written in one command batch before any external launch, outcomes are WBS attempt
ends, progress and measures, and locators live on the attempt. On every tick and every
restart it SHALL rebuild the walk from WBS and SHALL NOT replay a journal of its own.
Memory SHALL NOT establish durability (G2, 2026-10-25).

#### Scenario: The coordinator restarts with an empty working directory

- **WHEN** the coordinator restarts on another host with no local state
- **THEN** it rebuilds the frontier and the running attempts from WBS alone and admits no
  duplicate of a running attempt

#### Scenario: A launch is not recorded

- **WHEN** the WBS claim-and-attempt batch is refused or never acknowledged
- **THEN** no external launch happens for that step in that tick

### Requirement: Coordination uses the unified hints API

The coordinator SHALL rebuild CTT hints from versioned WBS facts and accepted outcomes.
It SHALL defer unfinished work rather than return successful no-op visitors. It SHALL use
ID-keyed summary and generation-checked settlement within the existing API, not require a
second public graph format. Complete WBS topology SHALL be discovered and validated before
admission; deferral SHALL NOT hide remaining vertices. Summary SHALL invoke no user code
and SHALL state incomplete discovery for a partial lazy graph. Host wait/running/retry
facts and WBS eligibility SHALL filter the kernel frontier before admission.

#### Scenario: Parallel join remains blocked

- **WHEN** backend and frontend are ready and backend alone reports accepted success
- **THEN** verification remains blocked until frontend also has accepted success

#### Scenario: A parent is deferred during inspection

- **WHEN** its declared child or a disconnected cyclic component is not yet inspected
- **THEN** discovery/validation continues independently and no incomplete summary authorizes work

#### Scenario: A stale settlement arrives

- **WHEN** a result belongs to an old runner or execution generation
- **THEN** settlement is refused without publishing output or satisfying a dependency

### Requirement: Admission and outcomes preserve exact authority

Admission SHALL atomically reserve capacity and record intent before external launch.
Claims, progress and release SHALL check exact current claim/run/attempt authority and
expected revisions. Validated outcomes SHALL be written to WBS as one command batch. Successors SHALL wait
for that write's acceptance. An effect that succeeded before its WBS write landed SHALL be
written on the next tick, not rerun. Retries SHALL use a
new attempt ID/ordinal within a durable budget and keep the logical operation identity.

#### Scenario: Progress acknowledgement is lost

- **WHEN** WBS applied the outcome batch but the coordinator died before reading the reply
- **THEN** the next tick reads the ended attempt from WBS and never reruns the effect

#### Scenario: A stale worker releases a claim

- **WHEN** a replacement attempt now owns the claim
- **THEN** the stale completion/release is refused and cannot affect the replacement

### Requirement: Restart reconciles surviving workers and uncertain effects

On boot the coordinator SHALL read the running attempts from WBS before admitting work or
ending attempts. It SHALL inventory running attempts, locate surviving workers/sessions and
reconcile effects by operation identity. It SHALL reattach safely or verify cancellation
and quiescence before replacement. It SHALL NOT infer interruption from coordinator death
alone. Unresolved worker/effect state SHALL require operator reconciliation and SHALL NOT
be automatically retried. Capacity SHALL remain reserved while physical work may survive.

#### Scenario: The worker survives coordinator death

- **WHEN** the coordinator restarts while its worker is still executing
- **THEN** it reattaches or quiesces that worker and admits no concurrent replacement

#### Scenario: An external effect cannot be determined

- **WHEN** launch or effect completion is ambiguous and the executor cannot inspect or deduplicate it
- **THEN** the attempt becomes unresolved, preserves its evidence and awaits an operator

#### Scenario: The owner is stale

- **WHEN** another coordinator's credential holds the claim
- **THEN** this one's end, progress and release commands are refused by WBS and it admits
  nothing on that step

### Requirement: Human waits and execution outcomes remain distinct

The coordinator SHALL record a human prompt and its correlation key on the WBS attempt,
consume authorized decisions deduplicated by that key and retain the claim.
Waiting SHALL NOT satisfy a dependency. Compute capacity SHALL be released only after
physical execution settles. End-of-turn SHALL NOT itself mean business success.

#### Scenario: A decision is delivered twice

- **WHEN** the same authorized response arrives before and after restart
- **THEN** it is consumed once and launches at most one logical continuation

### Requirement: Safe compatibility execution precedes deployment and dogfood

S7a SHALL implement the reconcile-loop coordinator over a linear compatibility workflow,
including surviving-worker, uncertain-effect, stale-claim and lost-reply tests, before
I5.02 deployment or I5.04 real dogfood. S7b SHALL reuse it for pinned type-specific instances,
parallel joins and repair. W0–W12 SHALL remain the acceptance scope for type-specific DAGs.
A linear dogfood SHALL NOT be presented as completion of that product scope.

#### Scenario: Coordinator code or its baseline recovery proof is missing

- **WHEN** deployment or real dogfood is requested
- **THEN** its S7a prerequisite is unmet and the milestone cannot be declared ready

#### Scenario: A branching workflow is repaired

- **WHEN** an operator approves a new execution epoch for one changed activity
- **THEN** affected downstream results are invalidated with provenance retained, and old outcomes cannot complete the repaired join
