## ADDED Requirements

### Requirement: PR comparisons use the validated synthetic merge first parent

The CI gate SHALL select scope from the event alone. `pull_request` SHALL run `nx affected` from the validated first parent of its checked-out synthetic merge. `push`, `merge_group` and `workflow_dispatch` SHALL retain the full gate. Unmapped events SHALL fail. Gate scope, browser scope and corpus PR selection SHALL use one resolver. The workspace SHALL validate its received base against that resolver in its own checkout before invoking Nx.

#### Scenario: The payload base predates the actual merge base

- **WHEN** the checked-out PR merge has first parent B and the payload base names an older A
- **THEN** all three consumers compare from B regardless of mutable branch movement
- **AND** no runtime fetch or branch lookup chooses the boundary

#### Scenario: A PR identity or merge cannot be proven

- **WHEN** the event is not pull_request, the run SHA or payload head is not a full lowercase SHA, the PR number is invalid, or the ref differs from refs/pull/NUMBER/merge
- **THEN** the resolver fails without emitting a usable base
- **AND** the same refusal occurs if local HEAD differs from the run SHA, the merge has other than two parents, either parent is unreadable, or its second parent differs from the payload head

#### Scenario: A cross-job boundary is stale or tampered

- **WHEN** the workspace receives a GATE_BASE different from its validated first parent
- **THEN** the workspace fails before invoking Nx

#### Scenario: A resolver invocation fails

- **WHEN** any consumer cannot resolve the PR boundary
- **THEN** that consumer fails before affected work or a successful scope decision
- **AND** the required aggregate cannot accept undecided or failed scope as a deliberate skip

#### Scenario: Events requiring the full gate

- **WHEN** the event is push, merge_group or workflow_dispatch
- **THEN** gate and browser scope retain their full behavior without requiring PR identity
- **AND** corpus selection retains its existing event-specific boundary
