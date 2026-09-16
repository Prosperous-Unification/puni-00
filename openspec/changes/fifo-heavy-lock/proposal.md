## Why

`with_heavy_lock` polls `mkdir` every five seconds, so a released lock goes to whichever waiter
polls first and arrival order buys nothing. A browser gate on h2puni waited 50 minutes while four
later jobs took the lock ahead of it (agent loop audit, item 12). Nothing reports who holds the
lock or who waits, so a starved lane looks exactly like a slow one.

## What Changes

**Service order**

- From: a released lock goes to whichever waiter polls first.
- To: waiters take it in arrival order.
- Impact: non-breaking; exit codes and `HEAVY_LOCK_WAIT_SECONDS` semantics unchanged.

**Queue observability**

- From: nothing reports the holder or the waiters.
- To: `bin/with-heavy-lock.sh status` prints the holder's pid and lane label, then each waiting
  ticket oldest first with its age; a run claiming the lock prints
  `heavy lock: waited <n>s behind <k> tickets`; the gate labels its lane `gate:<sha>`.
- Impact: non-breaking; stderr and one new subcommand.

**Dead waiters**

- From: no queue to wedge.
- To: a ticket whose pid is gone is removed by whoever sees it, named on stderr.

## Non-Goals

One lane: no priority classes, no fairness beyond arrival order. No lock path override — its
absence is what stops a caller opting out of the lock. No cross-host locking, no `flock`, no new
refusal codes.

## Constraints

Bash 3.2 (`/bin/bash` on macOS), no new dependency. Exit codes stay: 75 contention, 70 unknown
state. Every new check ships a watched negative in `bin/heavy-lock.test.sh`.

- assumed: no design interview was held; the dispatching controller ruled on the points below.
- assumed: the queue is `<lock path>.queue`, reached through the existing path argument and never
  through an environment variable.
- assumed: tickets order by `date +%s%N` (Darwin: `python3` `time.time_ns()`), pid breaking a tie.
- assumed: `<n>` is whole seconds from enqueue to claim and `<k>` the live tickets ahead at
  enqueue; it is always printed, including `waited 0s behind 0 tickets`.
- assumed: a waiter is dead exactly when `kill -0` fails, the holder-reclaim rule.

## Capabilities

### New Capabilities

- `heavy-lock-queue`: arrival-order service, observability and dead-waiter reclaim for the
  host-wide heavy-work lock.

### Modified Capabilities

None.

## Domain Terms

`Ticket`, `Lane label` — defined in `CONTEXT.md`.

## Decisions Recorded

None. The queue is reversible.

## Impact

`bin/heavy-lock-lib.sh`, `bin/with-heavy-lock.sh`, `bin/h2puni-gate.sh` and their tests. Every
agent lane gating on h2puni. No application, library or deploy path.
