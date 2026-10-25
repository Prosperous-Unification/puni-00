## ADDED Requirements

### Requirement: An admin approves an agent pool in one act

`POST /api/organization/agent-pools` SHALL be accepted only from an `admin` or `super_admin`
browser session. In one transaction it SHALL create the pool, `size` agent persons bound to the
caller's account and one credential each issued by the caller, and answer every API key exactly
once.

#### Scenario: Body bounds

- **WHEN** an admin posts a `size` of 0 or 101, a duplicate live `name`, an `oidc` pool whose
  subjects are not `size` distinct strings, or an `expiresAt` more than 90 days ahead
- **THEN** each is refused `400 invalid_body` (`409 name_taken` for the name) and nothing is
  written

#### Scenario: A pool of eight

- **WHEN** an admin posts `{ name: 'swarm-a', size: 8, credentialSource: 'api_key' }`
- **THEN** eight agent persons and eight API keys exist, each key acts as its own person
  capped at `member`, and the pool lists eight credentials with no secret

### Requirement: Pool creation is refused whole

A `member` or `viewer` SHALL be refused `403 forbidden`, and a delegation or machine principal
`403 insufficient_scope`. Crossing the agent-person cap SHALL be refused
`409 agent_person_limit` with the cap and the count. A refused creation SHALL write nothing. A
successful one SHALL write one `machine_credential_created` row per credential and one
`agent_pool_created` row.

#### Scenario: A pool that would cross the cap

- **WHEN** the organization holds 5 of 8 agent persons and an admin asks for a pool of 4
- **THEN** the answer is `409 agent_person_limit` naming 8 and 5, and no person, credential,
  pool or audit row was written

#### Scenario: A machine cannot make a pool

- **WHEN** a machine principal (raw key in a fixture, or a machine grant) posts to the route
- **THEN** the answer is `403 insufficient_scope`

### Requirement: A pool is fixed after creation and revoked as a unit

A pool SHALL never gain a person, a credential or a right after creation. `DELETE
/api/organization/agent-pools/:id` (admin only) SHALL revoke every live credential of the pool
in one transaction, ending their leases as a credential revoke does (L8), with one
`machine_credential_revoked` row each and one `agent_pool_revoked` row. At `expiresAt` every
pool credential SHALL be refused as revoked.

#### Scenario: Revoking a pool

- **WHEN** an admin deletes a pool whose agents hold leased claims
- **THEN** every pool credential's next token request is `401 invalid_client`, its next tool
  call is refused, and the claims are released with reason `credential revoked`

#### Scenario: An expired pool

- **WHEN** the clock passes a pool's `expiresAt`
- **THEN** a token request with any of its keys is `401 invalid_client`
