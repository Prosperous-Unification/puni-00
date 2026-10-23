## Context

Read on 2026-10-23 on `main` at `52a41bfc4`:

| Need                       | Exists today                                                                                                                                                                                    | Missing                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Who is an agent at a write | `credentialPinOf` answers `{ personId }` for a machine credential (API key, trusted-issuer token) and an MCP consent; the claim path already receives it as `credential` (`wbs-team-claims` D6) | nothing                                       |
| A claim                    | `claim (work_item_id, step_id, person_id, run_id, parent_claim_id, created_*)`; `claim_occupancy` cascades with it; the cap counts distinct `(work item, person, run)` triples                  | an instant by which it must be renewed        |
| A serialized release       | `releaseWorkItem` inside a batch: one `BEGIN IMMEDIATE` under `WriteCoordinator`, `claims.remove`, `announceTree`, one journal entry and one `plan_event`                                       | a release nobody pressed                      |
| A background loop          | `RetentionTimer` (`intervals.every`, drops a tick while one runs, `onError` required, started and stopped by `bootBe01`'s bag)                                                                  | a sweep over expired claims                   |
| Revocation                 | `MachineCredentialAdministrationRepository.revoke` and `ConsentCredentialRepository.revoke`, each one immediate transaction with an audit row                                                   | anything about the person's claims            |
| A person's removal         | `person_id` and `parent_claim_id` cascade; the directory refuses an unconfirmed removal while claims exist and takes them with a confirmed one                                                  | nothing (already frees occupancy and the cap) |
| Write-turn discipline      | issue #668 / PR #670: a last-use touch reads first and enters the turn only when due                                                                                                            | the same for a heartbeat                      |

## Goals / Non-Goals

**Goals:** an agent's claim is released by the coordinator when nobody renews it, freeing
occupancy and the cap; a revoked agent's claims go without waiting a lease out; renewal is
free on a write and cheap on a heartbeat; an agent can read when its leases end; the outcome
of any renew/sweep/release interleaving depends only on instants, never on turn order.

**Non-Goals:** human claims expiring; a per-organization lease length; fe-01 display (slice
2); a "stranded claims" admin view; undo of a reap.

## Decisions

All **assumed** by this draft (L1 to L16) (Dany has not decided, issue #667). Each is overrulable by id.

- **L1. Leased iff taken under a credential pinned to its own claimant.** API key,
  trusted-issuer token and MCP consent claims for themselves carry a lease; a session's, an
  upstream pair's, an admin's, and a pinned credential's delegated claim for another person do
  not (the last goes with its parent's cascade). Rejected: lease by `person.kind = 'agent'`
  (an admin's claim for an agent has nobody renewing it).
- **L2. One lease length, `CLAIM_LEASE_MS` = 15 minutes, a constant in `@wbs/domain`.**
  Rejected: a required `ORGANIZATION_DEFAULT_CLAIM_LEASE_SECONDS` plus an `organization_limits`
  column (about twenty deploy and fixture files and the limits CLI for a protocol constant, not
  a tenant plan knob); add when a tenant needs another value.
- **L3. The lease is two nullable columns on `claim`**: `lease_expires_at` and
  `lease_revoked_at`. Rejected: deriving it from `machine_credential.last_used_at` (no writes,
  but reads would keep claims alive and the instant would need a join); a `claim_lease` table
  (`moveAll` already keeps a column in place).
- **L4. Renewal is per person, on every committed project command batch by a pinned caller,
  inside that batch's transaction (no extra turn), plus `POST /api/claims/renew`.** It renews
  every unexpired, unrevoked lease of the pinned person whose expiry is earlier than
  `now + CLAIM_LEASE_MS − 60 s`, in every project. The route reads first outside the turn and
  enters it only when one is due, then decides again at the turn's own instant, so a heartbeat
  queued behind a long write never renews a lease that ran out while it waited. Rejected: a `renewClaims` batch command (every heartbeat
  would take the turn); renewal on reads (a stuck agent that polls would hold forever);
  renewal by undo, redo and directory batches (no claim work).
- **L5. An expired or revoked lease never revives.** A lease is in force on
  `[written, leaseExpiresAt)`; at `leaseExpiresAt` it is expired. Renewal touches only leases
  in force, so whether a claim is reaped depends on the instants of the renewals, not on
  whether the sweep has run yet. Rejected: renew-until-swept (the outcome would depend on
  sweep timing).
- **L6. An expired claim stays in force until the sweep releases it.** The claim path, the
  startable read and the cap still see it; the reads show the past `leaseExpiresAt`. Rejected:
  reaping inside `claimWorkItem` (a claim would write other agents' releases into its own
  journal entry).
- **L7. The sweep is a be-01 timer: at boot and every 30 s, at most 50 projects per tick.**
  It reads the projects holding an expired lease outside the turn and releases each project in
  its own unit of work (one `BEGIN IMMEDIATE`), re-reading expiry inside it. A tick arriving
  while one runs is coalesced into one follow-up. Rejected: one transaction for every project
  (one long turn stalls every agent).
- **L8. Revoking a person's last live credential ends its leases in the revoke's own
  transaction** (`lease_expires_at = lease_revoked_at = now`), and the admin revoke route asks
  the sweep for an immediate tick; the release itself is the sweep's. Rejected: releasing in
  the revoke transaction (a second release path writing history and announcements from the
  organization-administration store). A consent revocation ends leases the same way and is
  released by the next tick (no immediate tick: the consent route is outside the slice).
- **L9. `deletePerson` needs nothing new**: the existing cascade removes the person's claims
  and their occupancy in the removal's transaction, so the cap and the units are freed there.
- **L10. A reap is history, not anybody's undo entry.** It appends one `plan_event` of kind
  `release` (label `release "X" (lease expired)` or `(credential revoked)`, `after` naming the
  reason) under the claim's writing account, and touches no account's stack or redo branch.
  Undo has nothing to take back; an earlier claim entry of the holder is refused stale as
  "that claim has been released since". To get the work back, claim it again. Rejected: an
  entry on the writing account's stack (that account may be a human's bound account, whose
  Cmd+Z would undo a reap they never did); a system account (no such user row).
- **L11. A replayed claim gets a fresh lease.** A journalled `add_claims` names its leased
  claim ids (`leased`); a redo of a claim or an undo of a release puts those back with
  `leaseExpiresAt = replay instant + CLAIM_LEASE_MS`. An entry written before this change has
  none. Rejected: back without a lease (an agent's redo would never expire); back with the old
  instant (reaped on the next tick).
- **L12. Reads.** `leaseExpiresAt: number | null` on startable `claimed` and `subtreeClaims`
  and on person-work `claims`; `POST /api/claims/renew` answers `{ leases, leaseExpiresAt }`
  (the pinned person's leases in force and the earliest expiry, null when none). The claim
  result is unchanged (the renew answer and the reads carry the instant).
- **L13. An unpinned caller of the renew route is refused `403 not_pinned`.** Rejected:
  answering zero leases (a misconfigured agent would heartbeat into nothing, silently).
- **L14. Expired-but-unswept claims count under the cap and hold their units** (L6); the
  sweep frees both in its transaction.
- **L15. A reaped subtree claim takes its delegated claims with it** (`decideRelease`'s
  cascade, D8), each recorded in the same history event.
- **L16. A project whose release keeps failing is reported, not quarantined.** The sweep
  catches each project's failure, reports it through `onError` with the project id (be-01
  logs it at error), and goes on to the next project; candidates are ordered by their oldest
  expired lease. Not built: counting consecutive failures and raising them louder, or
  skipping a stuck project. Fifty or more projects failing every tick would still starve the
  rest (the tick reads at most fifty); a release that throws is corrupt trusted state, and
  the error log is the signal. Rejected for now: a failure counter with a quarantine table.

## Shape

- Migration `20261023100000_add_claim_lease`: `ALTER TABLE claim ADD lease_expires_at
integer`, `ADD lease_revoked_at integer`, index `claim_by_lease (lease_expires_at)`; a
  `down.sql` dropping the index and both columns. An outgoing release writes neither column, so
  its claims are leaseless (L1 holds for them as human claims would).
- `@wbs/domain` `claim-lease.ts`: `CLAIM_LEASE_MS`, `LEASE_RENEWAL_RESOLUTION_MS` (60 s),
  `leaseOf(credential pin, claimant, at)`, `isLeaseInForce`, `renewalDueBefore(at)`.
- `ClaimStore`: `add(…, leases)` writes each named claim's expiry; `listStampedByProject`
  answers `leaseExpiresAt`; `renewLeases(personId, at, expiresAt, dueBefore)` reads first and
  writes only when due; `expiredLeasesOf(projectId, at)` and `projectsWithExpiredLeases(at,
limit)`.
- `CommandJournalStore.appendEvent(event)`: history only, no stack (L10).
- `WorkItemService.releaseExpiredLeases(projectId)`; `PlanCommandRunner.releaseExpiredLeases`
  (its own unit of work) and renewal at the end of a committed `execute`.
- `ClaimLeaseSweep` (core, plan-commands module) over `intervals`, `now`, the runner and the
  public claim store; `bootBe01` starts and stops it as it does retention.

## Known edges (review notes, 2026-10-23)

- The heartbeat's reported `leaseExpiresAt` can name an instant that never committed. Its reads before the turn and its
  standing read share be-01's one writer connection, so while a project batch holds `BEGIN IMMEDIATE` across awaits the
  heartbeat sees that batch's uncommitted renewal; if the batch then rolls back, the stored expiry is up to one lease
  earlier than the answer said. Clients therefore heartbeat on a fixed cadence well inside `CLAIM_LEASE_MS` and never
  schedule from `leaseExpiresAt`. A later slice can move the standing read into the turn or onto a read-only connection.
- **Live credential** (L8) means unrevoked: a credential whose secrets have all expired
  still counts as live, so its leases are not ended at revocation of a sibling, and they run
  out at their own expiry. `lease_revoked_at` is never cleared: an agent given a new
  credential keeps losing the leases its last revocation ended; it claims again.
- **Rollback and mid-swap** (blue/green): the unguarded `down.sql` drops every lease, so after
  a rollback every claim is held until released, as before leases. The outgoing image writes
  leaseless claims, and its undo of a release puts claims back leaseless, so those are never
  reaped.
- **L1 hole:** a session's or an admin's claim made for an agent person is never leased, so
  it strands if that agent dies; only the agent's own claims self-heal.
- **Where a reap shows** (L10): the history event is under the claim's writing account,
  which for a machine principal is the agent person's bound account (often a human's), so
  the reap reads as theirs in the history.

## Risks

- A clock jump forward on the host reaps every lease at once. Leases are wall-clock instants
  in one process, the same clock that stamps every row; accepted.
- An agent that stops writing but keeps reading loses its claims after 15 minutes unless it
  heartbeats; documented in the renew route and the MCP tool description.
