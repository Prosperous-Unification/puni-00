## Why

Two agent fleets build puni-00 from one WBS project, and only a branch-prefix convention in a
note keeps them off each other's items. The plan already records who does what
(assignments), whose part of the tree is whose (team sets) and what is ready (status), yet a
fleet cannot claim an item atomically, cannot ask "what may my team start" in one read, and
one fleet cannot write at all. Claims live in free text and the plan disagrees with the tree
in both directions (two proven cases, 2026-10-19).

## What Changes

- **Claiming a leaf**
  - From: a fleet writes "taken" into the notes, or nowhere.
  - To: `claimWorkItem` assigns an agent to every unassigned step of a ready, unclaimed leaf
    in one journalled, undoable act; refuses `already_claimed`, `not_startable`,
    `outside_allotment`, `person_not_bound`. `releaseWorkItem` gives it back.
- **Finding work**
  - From: read the whole tree and GitHub, then guess.
  - To: one read lists the leaves a team may start: status `ready`, no assignment, team in
    the effective team set. The MCP inherits it.
- **Who is writing**
  - From: both fleets act as one human account; a fleet without a browser cannot write.
  - To: a person may be bound to an account; a claim on a bound person is accepted only from
    that account or an organization admin; an operator CLI grants a machine identity
    organization membership.

## Non-Goals

- Leases, expiry, reclamation inside WBS: Twilight Dash's runtime facts (A25; the
  2026-10-17 resource-claim design).
- Worktrees, disk and other resources.
- What a team label or a capacity means for the schedule; `setAssignee` is unchanged.
- GitHub identity per fleet; the Burokrat branch rule that will read these claims.

## Constraints

- Blue and green share one SQLite file: the one new column is nullable and additive, with a
  `down.sql` that refuses while any person is bound.
- A claim is a plan command: all-or-none in its batch, one journal entry, one revision
  bump, preconditions for undo (ADR 0019).
- Status is derived, never stored; `startable` reuses `statusOf` and `blockedByProxyOf`.
- Every refusal ships with a production-path negative and a `Proof:` comment.

## Capabilities

### New Capabilities

- `startable-work`: the leaves one team may start now, in one read.
- `agent-accounts`: a person bound to an account; membership for a machine identity.

### Modified Capabilities

- `plan-command-registry`: adds `claimWorkItem` and `releaseWorkItem`.

## Domain Terms

Allotment, Claim, Startable, Agent account (in `CONTEXT.md`; Dany's interview still owed).

## Decisions Recorded

none yet; design.md D1 to D6 name the candidates.

## Impact

Domain, contracts, core, store-sqlite (one migration), be-01, mcp-01 by derivation, fe-01.
