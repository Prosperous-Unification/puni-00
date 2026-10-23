## Why

A claim stays held until somebody releases it. When its agent crashes, is partitioned away or
has its credential revoked, its resource units stay occupied and its bound claim keeps a place
under the claim cap until a human admin releases it (issue #667, PR #666 finding F2). At swarm
scale this is the main way capacity leaks.

## What Changes

**A claim an agent takes carries a lease**

- From: every claim is held until released.
- To: a claim taken under a credential pinned to its own claimant (an API key, a trusted-issuer
  token, an MCP consent) carries `leaseExpiresAt`. A human's claim carries none and is never
  reaped.

**The agent keeps it alive**

- From: nothing to renew.
- To: every committed command batch of that agent renews all its unexpired leases inside the
  batch's own transaction; an idle agent heartbeats with `POST /api/claims/renew`, which takes
  the write turn at most once a minute.

**The coordinator gives back what nobody renews**

- From: a stranded claim stays.
- To: a be-01 sweep, at boot and every 30 seconds, releases each project's expired claims in
  one transaction, recorded in the project's history as a release with reason `lease_expired`,
  freeing occupancy and the claim-cap place and announcing the tree. Revoking a person's last
  live machine credential ends its leases in the revoke's own transaction and asks the sweep to
  run now; they are released with reason `credential_revoked`. `deletePerson` already takes a
  person's claims with it.

**Reads show it**

- From: claims show who, which run and when.
- To: the startable read, the person-work read and the renew answer show `leaseExpiresAt`.

## Non-Goals

- Leases on human claims; a per-organization lease length (L2); fe-01 display (slice 2).
- Reaping inside the claim path; reviving an expired lease; undoing a reap (L10).
- Renewal on reads; a heartbeat command inside the batch (L4).

## Constraints

- One additive migration with `down.sql`; an outgoing release keeps writing leaseless claims.
- Renewal never takes the write turn more than once per minute per agent (issue #668).
- Each release is one `BEGIN IMMEDIATE` under the write coordinator, so a renewal and a sweep
  are ordered by the turn and the outcome depends only on instants (L5).
- Every guard has a `Proof:`; the lifecycle gets a model-based race test.

## Capabilities

### New Capabilities

- `claim-leases`: which claims carry a lease, renewal, expiry, release reasons, revocation,
  the sweep, the reads.

## Domain Terms

Claim lease (in `CONTEXT.md`).

## Decisions Recorded

No ADR. L1 to L16 in design.md are assumed until Dany reads them; each is overrulable by id.

## Impact

`@wbs/domain` (the lease rules), `@wbs/core` (claim store port, journal port, work-item
service, plan-command runner, the sweep, the renew route), `@wbs/contracts` (read shapes, the
renew endpoint), `@wbs/store-sqlite` (migration, repository, revocation), `@wbs/store-memory`
and `@wbs/conformance` (twin and cases), be-01 (composition and boot), mcp-01 by derivation
(one more tool).
