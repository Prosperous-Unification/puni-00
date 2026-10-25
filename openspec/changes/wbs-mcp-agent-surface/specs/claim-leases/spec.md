## MODIFIED Requirements

### Requirement: A pinned caller's writes renew its leases

Every committed project command batch whose credential is pinned to a person SHALL renew, in
the batch's own transaction, every lease of that person in force and due (expiring before
`now + 15 minutes − 60 seconds`), in every project, to `now + 15 minutes`. When the
credential is a machine grant that carries a run (`wbs-mcp-agent-surface` M15), only the leases
of that person **and that run** SHALL be renewed. A caller with no run SHALL renew every lease
of the person, those of opted-in runs included. A lease past its
expiry, or ended by revocation, SHALL NOT be renewed.

#### Scenario: A progress write renews

- **WHEN** `codex` holds a claim leased until T + 900,000 and states progress at T + 600,000
- **THEN** its lease ends at T + 1,500,000

#### Scenario: A run-scoped write renews only its run

- **WHEN** `codex` holds leases under runs `a` and `b`, and a batch arrives under a grant with
  run `a`
- **THEN** only the run `a` leases are renewed

#### Scenario: A late renewal does not revive

- **WHEN** `codex`'s lease expired at T and it writes at T + 1, before any sweep
- **THEN** the lease is not renewed and the next sweep releases the claim

### Requirement: An idle agent heartbeats cheaply

`POST /api/claims/renew` SHALL renew the caller's pinned person's leases, scoped to the caller's
run when it has one, as a batch does, and
answer `{ leases, leaseExpiresAt }`: the leases in force and the earliest expiry, null when
none. It SHALL read first and enter the write turn only when a lease is due. An unpinned
caller SHALL be refused `403 not_pinned`. It reads no input: a request carrying a body (even
`{}`) SHALL be refused `400 invalid_body`, and one carrying a query string `400 invalid_query`,
renewing nothing.

#### Scenario: A heartbeat within the minute writes nothing

- **WHEN** `codex` renews twice 10 seconds apart while another batch holds the write turn
- **THEN** the second renew answers without waiting for the turn

#### Scenario: A no-run heartbeat renews every run

- **WHEN** `codex` holds leases under runs `a` and `b` and heartbeats under a grant whose
  token was issued without `wbs_run`
- **THEN** both runs' leases are renewed

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
