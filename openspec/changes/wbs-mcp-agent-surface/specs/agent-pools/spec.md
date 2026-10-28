## ADDED Requirements

### Requirement: An admin approves an API-key agent pool in one act

`POST /api/organization/agent-pools` SHALL be accepted only from an `admin` or `super_admin`
browser session. In one transaction it SHALL create the pool, `size` (1 to 100) agent persons
bound to the caller's account through `addPerson`'s agent-person cap check, and one API key
each issued by the caller, and answer the keys exactly once as one downloadable document. No
OIDC pool exists in v1.

#### Scenario: A pool of eight

- **WHEN** an admin posts `{ name: 'swarm-a', size: 8 }`
- **THEN** eight agent persons and eight keys exist, each acting as its own person capped at
  `member`, and the pool lists eight credentials with no secret

#### Scenario: Body bounds

- **WHEN** an admin posts a `size` of 0 or 101, a duplicate live `name`, an `oidc` source or an
  `expiresAt` more than 90 days ahead
- **THEN** each is refused (`400 invalid_body`, `409 name_taken` for the name) and nothing is
  written

#### Scenario: Name bounds

- **WHEN** an admin posts an empty `name`, one longer than 60 characters, or one shaped like a
  secret (a `wbs_mk_` or `wbs_scim_` prefix, 64 hex characters, or a `|`-separated subject)
- **THEN** each is refused `400 invalid_body` and nothing is written

#### Scenario: Keys answered once

- **WHEN** a pool is created or re-keyed
- **THEN** the answer is `201` with `Cache-Control: no-store` and one document naming the
  authorization server, the MCP resource and, per agent, its person, name, credential and key

### Requirement: Pools are listed without secrets

`GET /api/organization/agent-pools` (admin only) SHALL list every pool of the organization,
revoked ones included, each with its live credentials and never a secret or digest.

#### Scenario: Listing a pool

- **WHEN** an admin lists after creating a pool of 8
- **THEN** the pool is listed with eight credentials and no key, secret or digest; a member is
  refused `403 forbidden`

### Requirement: Pool creation is refused whole

A `member` or `viewer` SHALL be refused `403 forbidden`, a delegation, grant or machine
principal `403 insufficient_scope`, and a pool crossing the agent-person cap
`409 agent_person_limit` with the cap and count. A refused creation SHALL write nothing; a
successful one SHALL write one `machine_credential_created` row per credential and one
`agent_pool_created` row.

#### Scenario: Crossing the cap

- **WHEN** the organization holds 5 of 8 agent persons and an admin asks for a pool of 4
- **THEN** the answer is `409 agent_person_limit` naming 8 and 5, and nothing was written

#### Scenario: A machine cannot make a pool

- **WHEN** a machine principal posts to the route
- **THEN** the answer is `403 insufficient_scope`

### Requirement: A pool is re-keyed for its existing persons

`POST /api/organization/agent-pools/:id/rekey` (admin only) SHALL revoke every live pool key
and issue one fresh key per pool person holding a live pool key, in one transaction, creating
no person, and answer the new keys once. A body `expiresAt` SHALL replace the pool's within the
create bound; without one, a pool past its `expiresAt` SHALL be refused `409 pool_expired`.

#### Scenario: Re-keying at the cap

- **WHEN** an organization at its agent-person cap re-keys a pool of 8
- **THEN** eight new keys are answered, the old keys are refused at the next call, and the
  agent-person count is unchanged

#### Scenario: An agent revoked alone stays keyless

- **WHEN** an admin revokes one pool agent's key alone and then re-keys a pool of 3
- **THEN** two keys are answered and the revoked agent holds no live key

#### Scenario: Re-keying an expired pool

- **WHEN** an admin re-keys a pool past its `expiresAt` with no new one
- **THEN** the answer is `409 pool_expired` and nothing is written; with an `expiresAt` within
  90 days the keys are issued and admitted

#### Scenario: A pool person removed while keys were minted

- **WHEN** the keys a re-key minted no longer name exactly the pool's live-keyed persons
- **THEN** the answer is `409 pool_changed` and nothing is written

### Requirement: A pool is fixed after creation and revoked as a unit

A pool SHALL never gain a person or a right. `DELETE /api/organization/agent-pools/:id` (admin
only) SHALL revoke every live pool credential in one transaction, ending their leases (L8),
with one `machine_credential_revoked` row each and one `agent_pool_revoked` row. With
`removePersons: true` it SHALL then remove the pool's persons through the `deletePerson`
cascade.

#### Scenario: Revoking a pool

- **WHEN** an admin deletes a pool whose agents hold leased claims
- **THEN** every pool credential's next call and token request are refused and the claims are
  released with reason `credential revoked`

#### Scenario: Releasing the cap

- **WHEN** an admin revokes a pool of 8 with `removePersons: true`
- **THEN** the eight persons are removed by the `deletePerson` cascade, and the agent-person
  count drops by eight

#### Scenario: A refused removal

- **WHEN** the `deletePerson` batch of a `removePersons` revocation is refused
- **THEN** the pool stays revoked, its remaining persons stay, and the answer is
  `409 persons_not_removed` naming the pool and how many keys were revoked

### Requirement: A pool's expiry is judged at admission

At `expiresAt`, `admitMachineCredential` SHALL refuse every pool credential. Leases held
under those credentials SHALL lapse at their own lease end with reason `lease expired`.

#### Scenario: An expired pool

- **WHEN** the clock passes a pool's `expiresAt`
- **THEN** a token request with any of its keys is `401 invalid_client`, and its claims are
  released at most one lease period later with reason `lease expired`
