## Why

Two agent fleets build puni-00 from one WBS project, and only a branch-prefix convention in a
note keeps them apart. The plan records who does what (assignments) and whose part of the
tree is whose (team labels), yet nothing records who occupies a step now, a fleet cannot ask
"what may I start" in one read, and one fleet cannot write at all. Claims live in free text
and the plan disagrees with the tree (two proven cases, 2026-10-19).

## What Changes

- **Claiming**
  - From: a fleet writes "taken" into the notes, or nowhere.
  - To: a `claim` record beside the assignment. `claimWorkItem` claims steps (whole leaf by
    default) or a subtree, refuses when blocked, held, done or already claimed, states the
    step in progress, and records person, run id and parent claim. A superagent claims a
    subtree; its subagents claim leaves under it. `releaseWorkItem` gives back and cascades.
- **Finding work**
  - From: read the whole tree and GitHub, then guess.
  - To: one read lists startable steps, filtered by team, with claims shown apart.
- **Who is writing**
  - From: both fleets act as one human account; a fleet without a browser cannot write.
  - To: the account stays the human's; each fleet gets a credential linked to it and pinned
    to its agent person; a person is bound to the account that may act as it.

## Non-Goals

- Leases, expiry, reclamation inside WBS: Twilight Dash's runtime facts (A25).
- Resources other than people; what team labels and capacity mean for the schedule.
- `setAssignee` and the assignment: unchanged, team labels stay advisory.
- GitHub identity per fleet; the Burokrat branch rule; the two kinds of blocked.

## Constraints

- Blue and green share one SQLite file: one table and two nullable columns, additive, with
  guarded `down.sql` files.
- A claim is a plan command: all-or-none, one journal entry, one revision bump,
  preconditions for undo (ADR 0019).
- Status is derived, never stored; `startable` reuses the table's folds.
- Every refusal ships with a production-path negative and a `Proof:` comment.

## Capabilities

### New Capabilities

- `startable-work`: the steps one team may claim now, in one read.
- `fleet-credentials`: a person bound to an account; a credential linked and pinned.

### Modified Capabilities

- `plan-command-registry`: adds `claimWorkItem` and `releaseWorkItem`.

## Domain Terms

Allotment, Claim, Delegated claim, Startable, Agent run, Fleet credential (in `CONTEXT.md`).

## Decisions Recorded

design.md D1 to D8, confirmed with Dany on 2026-10-19; three marked assumed.

## Impact

Domain, contracts, core, store-sqlite, be-01, mcp-01 by derivation, fe-01.
