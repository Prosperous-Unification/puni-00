## Why

People managing a swarm cannot see it in fe-01. Claims exist since `wbs-team-claims` and leases
since `wbs-claim-leases`, yet the table shows no claim at all: `wbs-team-claims` 1.7 was never
built, `wbs-claim-leases` 2.1 was planned on a chip that does not exist, and fe-01 never reads
the plan history. No existing read can carry the chip: the startable read shows claimed steps
only of startable leaves, the person-work read is one person, the tree read carries no claims
and refetching it on every heartbeat would be heavy.

## What Changes

- **Reading claims**
  - From: claims reach a client only through the startable or person-work read.
  - To: one complete claims read per project, with holder, run, parent claim, lease and the
    server's read instant; an MCP tool by derivation.
- **Keeping it fresh**
  - From: a heartbeat renews a lease silently.
  - To: fe-01 refreshes claims as their own resource, on every tree change and on a new
    `claims_changed` event the renew route publishes.
- **Seeing claims**
  - From: nothing.
  - To: a **claim chip** beside each step's assignee and on a subtree claim's parent row; a
    leased claim shows its remaining minutes or **releasing**; the card names holder, run,
    parent claim and lease.
- **Seeing releases**
  - From: a reaped claim's chip would just vanish.
  - To: a **claim history** read and a Claims sheet listing who holds what now and the recent
    claims and releases with their reason.

## Non-Goals

- Claiming or releasing from fe-01; a general plan-history view; undo of a reap.
- Lease length, renewal or sweep changes; anything `wbs-claim-leases` decides.
- Conditional GETs or ETags on any read; claims in the tree read or the plan export.

## Constraints

- Builds on `wbs-claim-leases` slice 1 on `main` (PR #671); the reads require its fields.
- Additive contracts; a newer fe-01 must survive an older be-01 mid-swap as rendered states.
- Unclaimed plans pay nothing: no slot, no ticker, no extra width.
- R5: every new check has a production-path negative and a `Proof:` comment.

## Capabilities

### New Capabilities

- `claim-reads`: the complete claims read, the `claims_changed` event, the claim history read.
- `claim-display`: the chips, lease display and the Claims sheet in fe-01.

### Modified Capabilities

- `plan-refresh`: claims become a fifth resource with their own invalidation.

## Domain Terms

Claim chip, Releasing claim, Claim history (in `CONTEXT.md`).

## Assumptions (overrule by id; detail in design.md)

| Id  | Assumed                                                                                          |
| --- | ------------------------------------------------------------------------------------------------ |
| C1  | Read source: a new complete claims read `GET /api/projects/:id/claims`, not the tree read.       |
| C2  | Its rows: address, step or none, holder, run, parent claim, instants, lease end, revocation.     |
| C3  | Claims are a fifth plan-refresh resource; `tree_replaced` refreshes tree and claims.             |
| C4  | The renew route publishes `claims_changed` per project it moved; revocations stay unannounced.   |
| C5  | fe-01's handling of `claims_changed` ships before be-01 publishes it.                            |
| C6  | Remaining time counts from the read's server instant on a monotonic clock, in whole minutes.     |
| C7  | Folded cell: initials chip in a slot paid only where a column has a claim; minutes elsewhere.    |
| C8  | A subtree claim's chip sits in its row's Name cell; leaves under it and collapsed rows add none. |
| C9  | The hover card and accessible name carry the whole sentence.                                     |
| C10 | Lease states: none, in force, releasing; a revoked lease reads releasing, card says why.         |
| C11 | A claim whose row or step the installed tree lacks is not drawn until the reads agree.           |
| C12 | A failed claims read draws no chips and shows the refresh failure; never the Error Boundary.     |
| C13 | Release history: a claim history read and a Claims sheet section; no general history view.       |
| C14 | History reason derived from the stored command; deleted persons and items read as null.          |
| C15 | No claim or release control in fe-01.                                                            |
| C16 | The Claims sheet opens from a toolbar button with the held count, and from the phone sheet.      |
| C17 | The phone cards layout carries the same chips.                                                   |
| C18 | Supersedes `wbs-team-claims` 1.7 and `wbs-claim-leases` 2.1.                                     |

## Impact

`@wbs/contracts` (two reads, one event), `@wbs/core` (claims and claim-history features, the
renew route's announcement, optimizer trigger), `@wbs/store-sqlite` and `@wbs/store-memory`
(lease revocation instant on stamped reads), be-01 routes, mcp-01 by derivation (two tools),
fe-01 (refresh coordinator, step and name cells, cards, Claims sheet).
