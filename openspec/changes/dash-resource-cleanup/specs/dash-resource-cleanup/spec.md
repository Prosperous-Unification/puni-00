## ADDED Requirements

### Requirement: Durable managed creation and admission

Dash SHALL atomically persist identity and reserve disk/workspace units before creation in
an enrolled owner-only root. All projects SHALL share its ledger; unreleased uses SHALL
remain charged. WBS SHALL durably admit exact runtime identity and authorized attribution
before physical creation or ordered source sequence allocation. New allocations SHALL fail
closed without admission; admitted cleanup SHALL continue during WBS outages.

#### Scenario: Planning deletion before first source publication

- **WHEN** a durably admitted task or project is deleted before its first ordered event arrives
- **THEN** exact admission replay and ordered confirmation use immutable original attribution without duplicate registration history or loss of newer cleanup requests

#### Scenario: Lost admission response or dead creator

- **WHEN** WBS admitted a use but Dash did not durably receive its receipt
- **THEN** no physical work or source sequence is created, the intent remains charged, and recovery replays exact admission before verified noncreation cleanup

#### Scenario: Admission refused while another admitted use completes

- **WHEN** an admission names missing or foreign references or its authority cannot be authenticated
- **THEN** it creates no physical path or source sequence and does not block existing admitted cleanup or publication

#### Scenario: Cleanup request arrives during provisional admission

- **WHEN** WBS queues cleanup at source revision 0 before ordered confirmation
- **THEN** confirmation preserves its pending status and projection history and Dash acknowledges it only with subsequent ordered events

#### Scenario: Watcher observes a live admission in flight

- **WHEN** a live creator awaits its first admission response
- **THEN** the watcher does not recover or cancel that creation; parent sealing still prevents any later physical creation

#### Scenario: Provisional provider or resource deletion

- **WHEN** deletion would remove a resource or provider with an admitted runtime obligation
- **THEN** deletion refuses even before the runtime publishes its first ordered event

#### Scenario: Competing projects need the last workspace slot

- **WHEN** two projects concurrently request the last available slot
- **THEN** at most one resource is admitted and created

#### Scenario: Pending cleanup cannot free capacity

- **WHEN** a use is pending, blocked or retained
- **THEN** its reservation remains unavailable to new work across runtime restart

#### Scenario: Creation crashes before acknowledgement

- **WHEN** the runtime restarts after creation intent or the creation effect
- **THEN** it reconciles that incarnation before releasing capacity or accepting a replacement

### Requirement: Mandatory managed execution cleanup

Dash SHALL durably request cleanup after managed command success, failure or cancellation.
Restart reconciliation SHALL recover cleanup obligations after the tracked owner disappears.
Automatic watch processing SHALL not require a live agent session.

#### Scenario: Managed command finishes

- **WHEN** a tracked command succeeds, fails or is cancelled
- **THEN** its resource has a durable cleanup obligation independent of the command outcome

#### Scenario: Worker is killed

- **WHEN** the worker disappears without running its finalizer
- **THEN** reconciliation checks process identity and requests cleanup without trusting a reused PID

### Requirement: Safe local provider release

The provider SHALL verify ownership, incarnation, containment, required preservation,
dependencies and live holds before removal and SHALL verify absence before release.
Inconclusive required evidence SHALL block release. Nonterminal uses SHALL retain capacity.

#### Scenario: Path replacement

- **WHEN** another directory or symlink occupies a recorded locator
- **THEN** cleanup refuses to remove the replacement and keeps the use charged

#### Scenario: Active dependency or writer

- **WHEN** a supported dependency, live file reference or mount still reaches the use
- **THEN** cleanup is blocked and no verified release is published

#### Scenario: Unreadable process evidence

- **WHEN** required process inspection is unavailable
- **THEN** cleanup records a blocker rather than treating the process as absent

#### Scenario: Source work needs preservation

- **WHEN** a Git worktree contains unpreserved changes or required ignored files
- **THEN** it remains retained with a responsible owner, reason and review date

#### Scenario: Git index flags hide modified source

- **WHEN** a worktree index has assume-unchanged or skip-worktree entries
- **THEN** cleanup retains the worktree bytes, owner and review obligation, keeps capacity charged, and publishes no verified release

#### Scenario: Explicit generated output policy

- **WHEN** a creation request marks a generated directory disposable and no tracked source falls within it
- **THEN** cleanup may remove that output without treating unrelated ignored files as disposable

#### Scenario: Shared generated files

- **WHEN** generated files remain hardlinked to storage without an accounted continuing owner
- **THEN** cleanup preserves the reservation and explains the shared-storage blocker

#### Scenario: Clean committed worktree

- **WHEN** a clean worktree has no blockers
- **THEN** committed work is preserved durably before registered worktree removal and verified release

### Requirement: Atomic release and recoverable publication

Dash SHALL commit verified release, exact reservation settlement and publication outbox
entry atomically. WBS outages SHALL preserve publication for retry. Unmeasured reclaimed
bytes SHALL remain unknown rather than equal reserved capacity.

#### Scenario: Crash after removal

- **WHEN** removal finishes and the runtime dies before recording release
- **THEN** reconciliation verifies the original incarnation and does not delete a replacement

#### Scenario: Lost acknowledgement

- **WHEN** WBS accepted an event but its response was lost
- **THEN** Dash replays the same event without a second release or duplicate history entry

#### Scenario: Retention history arrives after its review date

- **WHEN** an ordered retained event arrives after its review deadline because publication was offline
- **THEN** WBS validates the deadline against the original observation time and records the overdue retention without wedging later history

### Requirement: Bound runtime authority

WBS SHALL accept physical release events only from the exact active machine credential
bound by an organization admin to that organization, provider, authority and epoch.
Events SHALL enforce ordered sequence, immutable use identity and idempotent replay.

#### Scenario: Ordinary worker claims release

- **WHEN** an ordinary worker or browser submits a runtime release event
- **THEN** WBS refuses certification without changing the projection

#### Scenario: Cross-tenant or stale event

- **WHEN** an event has foreign attribution, a revoked credential, wrong epoch, conflicting identity or sequence gap
- **THEN** WBS refuses it without partially advancing the stream

#### Scenario: Account ownership changes while an event waits

- **WHEN** a previously admitted runtime actor waits while its person is unbound or rebound to another account
- **THEN** the transactional authority check refuses the stale actor before changing history or sequence

### Requirement: Durable operator cleanup requests

WBS SHALL persist authorized cleanup requests independently of runtime observations.
Dash SHALL persist request intent and its consumed cursor together. WBS SHALL acknowledge
requests only through bound runtime events. Runtime state and WBS revision SHALL be separate.

#### Scenario: Request accepted while Dash is offline

- **WHEN** an operator requests cleanup and Dash cannot receive it
- **THEN** WBS shows a pending request and the last observed runtime state without showing verified release

#### Scenario: Runtime restarts while consuming requests

- **WHEN** Dash restarts during delivery
- **THEN** the request is either redelivered or already has durable cleanup intent

#### Scenario: A terminal use acknowledges another cleanup request

- **WHEN** the runtime acknowledges a request for an already released use
- **THEN** the complete release evidence remains identical, including its disposition, without another physical effect

### Requirement: Honest operational coverage

The UI SHALL distinguish reported release, verified release, pending requests, blockers and
retention. Documentation SHALL name supported managed entrypoints and provider boundaries.
Existing unmanaged executions SHALL NOT be shown as physically cleaned by implication.

#### Scenario: Reported and runtime-owned uses appear together

- **WHEN** the project lists both sources
- **THEN** manual release reporting is available only for reported uses and runtime release is labeled verified

#### Scenario: Runtime cannot inspect the laptop user processes

- **WHEN** the supported process-visibility precondition is not met
- **THEN** operation explains the blocker and does not advertise successful automatic cleanup
