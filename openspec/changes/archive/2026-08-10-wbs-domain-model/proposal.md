## Why

The product has accounts, sessions and a live presence roster, and no work breakdown.
be-01 persists users and an event log; nothing else. Everything in `init-spec-prompt.md`
that makes this a WBS tool — the nested table, numbers the system decides, three-point
estimates that add up — is absent. There is nothing to plan with, and nothing for the
socket to carry but who is online.

## What Changes

**A work breakdown, owned by be-01**

- From: `users` and an event log.
- To: projects, work items nested arbitrarily deep, roles, and per-role estimates.
- Impact: new tables only. Auth, presence and the deploy path are untouched.

**Numbers the system decides**

- From: nothing.
- To: numbers derived from position on every read — `010`, `020`, `010.1` — repadded to
  `010.01` when a parent reaches its tenth child. A project-wide freeze writes the current
  numbers into storage; work items added afterwards keep deriving until the next freeze.
  A frozen work item cannot move until it is unfrozen, singly or project-wide.

**Estimates that add up**

- From: nothing.
- To: optimistic, realistic and pessimistic days, per work item per role, seeded with `Dev`
  and `QA`. A parent's estimates are the sums of its descendants', computed on read. A
  first child inherits its parent's estimates; deleting a last child returns them.

**Edits that arrive live**

- From: the socket carries presence only.
- To: `project:<id>` subscriptions over the push path that already exists. Cell edits
  broadcast the changed work item and its recalculated ancestors; structural changes
  broadcast the whole project, because one move can renumber a large slice of it.

## Non-Goals

Dependencies between work items. Assignees and the people roster. The Gantt chart. Export
in any format. Undo. Offline editing — see [ADR 0003](../../../docs/adr/0003-the-work-breakdown-lives-on-the-server.md).
Team role presets. Nesting depth limits.

## Constraints

Every authenticated account may read every project; a restricted project accepts edits only
from its owner. Numbers are derived, never authored by a client. Estimates validate
`optimistic ≤ realistic ≤ pessimistic` in `shared-lib-01`, enforced on both tiers from one
schema. Migrations must be backward-compatible: two be-01 processes share one SQLite file
during a swap.
