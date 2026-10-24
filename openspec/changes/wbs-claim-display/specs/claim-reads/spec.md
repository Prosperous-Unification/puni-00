## ADDED Requirements

### Requirement: One read answers every claim of a project

be-01 SHALL offer `GET /api/projects/:id/claims`, derived from the shared HTTP descriptor so
the MCP server offers it as a tool, answering `readAt` (be-01's clock at the read) and every
claim held in the project, step claims and subtree claims, whatever the leaf's status. A
caller the tree read refuses SHALL be refused alike. The read SHALL NOT depend on the schedule
engine.

#### Scenario: A claim on a blocked leaf is listed

- **WHEN** `codex` holds `Impl` of leaf `080.25` and the leaf is later held `blocked`
- **THEN** the claims read lists that claim, with no team filter to pass

#### Scenario: The read is a viewer's read

- **WHEN** a caller with role `viewer` in the project's organization asks
- **THEN** the read answers; a caller with no membership is refused as the tree read refuses

#### Scenario: The read does not need the engine

- **WHEN** the tree read is refused `engine_unavailable`
- **THEN** the claims read still answers

### Requirement: Each listed claim carries its address, holder, run and lease

Each claim in the claims read SHALL carry `claimId`, `workItemId`, `number`, `numberIsFrozen`,
`name`, `stepId` (`null` for a subtree claim), `holder` (`personId`, `name`), `runId`,
`parentClaimId`, `claimedAt`, `leaseExpiresAt` and `leaseRevokedAt`. Claims SHALL be ordered
by their work item's tree position, a subtree claim before the step claims of the same item,
step claims in the project's step order.

#### Scenario: A subtree claim and its delegated claim are both listed

- **WHEN** `claire` holds a subtree claim on `080` and her subagent holds `Impl` of `080.25`
  as a delegated claim under it
- **THEN** the read lists the subtree claim with `stepId: null` first, then the step claim
  with `parentClaimId` naming it

#### Scenario: A revoked lease reads as revoked

- **WHEN** an agent's last credential is revoked at instant R and the sweep has not run
- **THEN** its claim is listed with `leaseExpiresAt` R and `leaseRevokedAt` R

#### Scenario: A human claim carries no lease

- **WHEN** a session claims a step for a person
- **THEN** the claim is listed with `leaseExpiresAt` and `leaseRevokedAt` null

### Requirement: A heartbeat that moves a lease announces it

When `POST /api/claims/renew` commits at least one renewed lease, be-01 SHALL publish one
`claims_changed` project event for each project in which a lease moved, after the commit. A
renewal that moves nothing SHALL publish nothing. The optimizer trigger SHALL NOT schedule
optimization on `claims_changed`.

#### Scenario: A due heartbeat announces its project

- **WHEN** `codex` holds leases in projects P and Q, both due, and heartbeats
- **THEN** one `claims_changed` reaches P's subscribers and one reaches Q's

#### Scenario: A heartbeat within the minute announces nothing

- **WHEN** `codex` heartbeats twice within one minute
- **THEN** the second heartbeat publishes no event

#### Scenario: The optimizer ignores it

- **WHEN** `claims_changed` is published on a project with the optimized engine
- **THEN** no optimization is scheduled

### Requirement: A bounded read lists a project's claims and releases

be-01 SHALL offer `GET /api/projects/:id/claim-history`, derived from the shared HTTP
descriptor, answering the project's claims and releases newest first, at most `limit` of them
(1 to 100, default 50): its `claim` and `release` plan events, and each claim or release run
inside a `batch` plan event beside other commands, found before the limit is applied. A
`limit` outside 1 to 100 SHALL be refused `400 invalid_query`. Undo and redo entries SHALL NOT
be listed. A caller the tree read refuses SHALL be refused alike at admission; membership is not
rechecked inside the read, as the plan history read does not.

#### Scenario: The limit bounds the answer

- **WHEN** the project holds 120 claim and release events and the caller asks with no limit
- **THEN** the read answers the newest 50

#### Scenario: An out-of-range limit is refused

- **WHEN** the caller asks with `limit=0`
- **THEN** the read is refused `400 invalid_query`

#### Scenario: A claim inside a batch is listed

- **WHEN** `claire` claims `080.25` in one batch with a `setProgress` on another item
- **THEN** the read lists that claim with reason `claimed`, under the batch's event id

#### Scenario: A batch releasing one claim and claiming another lists two events

- **WHEN** one batch releases `claire`'s claim on `090` and then claims `080.1` for `codex`
- **THEN** the read lists the claim on `080.1` first and the release of `090` second, both
  with the batch's event id, told apart by `act`

### Requirement: A history event names who, what and why

Each claim history event SHALL carry `eventId`, `act`, `at`, `kind`, `reason` and `claims`;
`act` is the event's place among its batch's claim and release acts in run order, 0 for an
event that is not a batch. `reason`
SHALL be `claimed` for a claim, `released` for a release command, and `lease_expired` or
`credential_revoked` for a release the sweep wrote. Each claim SHALL carry `claimId`,
`workItemId`, `stepId`, `runId`, `holder` (`personId`, and `name` or `null` when the person is
deleted since) and `item` (`number`, `numberIsFrozen`, `name`, or `null` when the work item is
deleted since).

#### Scenario: A reap names its reason and holder

- **WHEN** the sweep releases `codex`'s claim on `080.25` because its lease expired
- **THEN** the newest event has kind `release`, reason `lease_expired` and one claim naming
  `codex`, its run and `080.25`

#### Scenario: A manual release reads released

- **WHEN** `ada` releases her claim with `releaseWorkItem`
- **THEN** the event's reason is `released`

#### Scenario: A deleted holder stays in history

- **WHEN** a claim event names a person deleted since
- **THEN** that claim's holder has the person id and name `null`

### Requirement: Undecodable claim history fails the read

An event whose stored command the journal's decoder cannot decode SHALL fail the claim history
read; it SHALL NOT be skipped or answered in part.

#### Scenario: Corrupt history fails loudly

- **WHEN** a stored `release` event's command does not decode
- **THEN** the read fails with a server error naming the event, and answers no partial list
