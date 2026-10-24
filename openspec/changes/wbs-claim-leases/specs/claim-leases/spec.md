## ADDED Requirements

### Requirement: A claim an agent takes for itself carries a lease

A claim written by `claimWorkItem` under a credential pinned to its own claimant (an API key, a
trusted-issuer token or an MCP consent of that person) SHALL carry `leaseExpiresAt` equal to
the claim's instant plus 15 minutes. A claim written under any other credential, or by a pinned
credential for another person, SHALL carry none and SHALL never be released by expiry.

#### Scenario: An API-key claim is leased

- **WHEN** agent `codex` claims a leaf with its own API key at instant T
- **THEN** the claim's `leaseExpiresAt` is T + 900,000

#### Scenario: A human claim is never reaped

- **WHEN** a session claims a leaf for a person and no write follows for a day
- **THEN** the claim's `leaseExpiresAt` is null and the claim is still held after every sweep

### Requirement: A pinned caller's writes renew its leases

Every committed project command batch whose credential is pinned to a person SHALL renew, in
the batch's own transaction, every lease of that person in force and due (expiring before
`now + 15 minutes − 60 seconds`), in every project, to `now + 15 minutes`. A lease past its
expiry, or ended by revocation, SHALL NOT be renewed.

#### Scenario: A progress write renews

- **WHEN** `codex` holds a claim leased until T + 900,000 and states progress at T + 600,000
- **THEN** its lease ends at T + 1,500,000

#### Scenario: A late renewal does not revive

- **WHEN** `codex`'s lease expired at T and it writes at T + 1, before any sweep
- **THEN** the lease is not renewed and the next sweep releases the claim

### Requirement: An idle agent heartbeats cheaply

`POST /api/claims/renew` SHALL renew the caller's pinned person's leases as a batch does and
answer `{ leases, leaseExpiresAt }`: the leases in force and the earliest expiry, null when
none. It SHALL read first and enter the write turn only when a lease is due. An unpinned
caller SHALL be refused `403 not_pinned`. It reads no input: a request carrying a body (even
`{}`) SHALL be refused `400 invalid_body`, and one carrying a query string `400 invalid_query`,
renewing nothing.

#### Scenario: A heartbeat within the minute writes nothing

- **WHEN** `codex` renews twice 10 seconds apart while another batch holds the write turn
- **THEN** the second renew answers without waiting for the turn

#### Scenario: A session heartbeat is refused

- **WHEN** a browser session posts to `/api/claims/renew`
- **THEN** it is refused `403 not_pinned` and nothing is written

#### Scenario: A heartbeat carrying a body is refused, not failed

- **WHEN** `codex` posts `{}` as `application/json` to `/api/claims/renew`
- **THEN** it is refused `400 invalid_body`, no lease moves, and a body-less heartbeat after it
  renews

#### Scenario: A heartbeat carrying a query string is refused

- **WHEN** `codex` posts to `/api/claims/renew?wait=1`
- **THEN** it is refused `400 invalid_query` and no lease moves

### Requirement: The coordinator releases claims nobody renewed

be-01 SHALL, at boot and every 30 seconds, release every claim whose lease has expired, each
project in one immediate transaction, re-reading expiry inside it, with every claim delegated
under a released subtree claim, freeing its occupancy and its bound-claim place. A claim
renewed before the instant of its expiry SHALL NOT be released, whatever the order of renewal
and sweep.

#### Scenario: Expiry exactly at the boundary

- **WHEN** a lease expires at T and the sweep runs at T − 1, then at T
- **THEN** the first sweep releases nothing and the second releases the claim

#### Scenario: A waiting agent's retry is admitted

- **WHEN** a leaf's exclusive unit and the last claim-cap place are held by a claim whose lease
  expired, and a second agent's claim was refused `resources_exhausted`
- **THEN** after the sweep the second agent's retry is applied

### Requirement: A reap is recorded in history and on no undo stack

A release by the coordinator SHALL bump the work items' revisions, announce the tree, and
append one history event of kind `release` naming the reason `lease_expired` or
`credential_revoked`, under the claim's writing account, and SHALL add nothing to any
account's undo stack or clear its redo branch.

#### Scenario: Undo has nothing to take back

- **WHEN** the holder's account presses undo after its claim was reaped
- **THEN** the undo is refused stale and the claim stays released

### Requirement: Revoking the last live credential ends the leases

Revoking a person's last unrevoked machine credential SHALL, in the revoke's transaction, end
every lease of that person, and its claims SHALL be released with reason `credential_revoked`
by the sweep the admin revoke requests at once. Revoking one of two live credentials SHALL end
none. Deleting a person SHALL take its claims, their occupancy and their bound-claim places in
the removal's transaction.

#### Scenario: Revoke one of two

- **WHEN** `codex` holds two live API keys and one is revoked
- **THEN** its leases stay in force and its claims stay held

### Requirement: Claim reads show the lease

The startable read's `claimed` and `subtreeClaims` entries and the person-work read's `claims`
SHALL carry `leaseExpiresAt`, a number of epoch milliseconds or null for a leaseless claim.

#### Scenario: An agent reads its lease

- **WHEN** `codex` claimed at T and reads its person work at T + 1
- **THEN** its claim shows `leaseExpiresAt: T + 900000`
