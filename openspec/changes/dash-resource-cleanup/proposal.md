## Why

Agent sessions leave temporary directories and Git worktrees after their work ends. WBS
needs to show which resources remain, while a durable runtime must own their creation,
cleanup and reservation settlement independently of the worker's lifetime.

## What Changes

Implement a Linux Dash resource runtime with an owner-only managed root, one SQLite ledger,
atomic admission, managed directory/worktree creation, tracked command execution, automatic
cleanup and restart reconciliation. Integrate authenticated ordered events and durable
cleanup requests with WBS. Show reported release separately from runtime-verified release.

The runtime is opt-in for explicitly managed workloads. Claude and Codex commands can run
inside its execution boundary; additional copies must use the same managed allocator.
Existing arbitrary laptop paths do not become disposable through age or registration alone.

## Constraints

- Work completion requests cleanup; only successful provider verification settles capacity.
- Pending, blocked and retained uses remain charged across restart and WBS outages.
- Preserve source work. Dirty worktrees remain retained with an owner and review date.
- Bind the runtime reporter to an organization, provider, exact credential and immutable epoch.
- One canonical managed pool shares admission across projects; WBS claim occupancy is unchanged.
- Require Linux procfs visibility for the supported dedicated runtime user. Unavailable
  inspection blocks cleanup. A private test PID namespace does not prove host-wide exclusion.
- Reservation budgets and free-space checks are not filesystem quotas or hostile-user isolation.

## Capabilities

### New Capabilities

- `dash-resource-cleanup`: managed resource creation, automatic cleanup, durable reservations,
  recovery and WBS runtime event/request exchange.

## Scope boundary

The first provider supports local disposable output directories, registered Git worktrees
and tracked commands. Container/volume adapters, reusable pools and arbitrary legacy-path
adoption require their own provider proofs. This extends the reported-tracking increment;
it does not retroactively certify that manually reported releases were physically verified.
