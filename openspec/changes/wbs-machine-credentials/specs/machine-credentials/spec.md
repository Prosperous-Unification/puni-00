## ADDED Requirements

### Requirement: A member creates a credential for their own agents, an admin for any agent

`POST /api/organization/machine-credentials` SHALL be accepted, after activation, from a
current member of the active organization. The body SHALL name a `source` of `api_key` or
`oidc` (`mcp_consent` is minted only at consent, and any other value, `auth0` included,
SHALL be refused `400 invalid_body`), a `name` (1 to 80 characters, unique among the organization's
unrevoked credentials), and a `personId` of a person of kind `agent` owned by the active
organization and bound to an account that is a current member of it. A caller whose role is
`member` or `viewer` SHALL be accepted only for a person bound to the caller's own account
and refused `403 forbidden` for any other; an `admin` or `super_admin` SHALL be accepted for
every agent person of the organization. The credential SHALL record the caller as its
issuer and SHALL be written in one transaction with its audit row. The response SHALL carry
the credential's id, source, name, person, issuer account, creation time and, for
`api_key`, the secret, which SHALL never be readable again. A person of another
organization or of kind `human` SHALL be refused `404 unknown_person`; an unbound person
`409 person_not_bound`; a person bound to an account that is not a member `409
account_not_member`; a duplicate name `409 name_taken`; before activation every credential
route SHALL answer `403 no_active_organization`.

#### Scenario: An API key is created and shown once

- **WHEN** an admin of A posts `{ source: 'api_key', name: 'claire', personId: <claire> }`
- **THEN** the response carries a key of the form `wbs_mk_<the credential's id>.<secret>`,
  storage holds only the secret's SHA-256 digest in `machine_credential_secret`, the list shows the credential without any
  secret, and one `machine_credential_created` audit row names the actor as issuer, the
  person and the source and holds neither the secret nor its digest

#### Scenario: A member issues for their own agent

- **WHEN** a caller with role `member`, whose account person `bob-agent` is bound to, posts
  `{ source: 'api_key', name: 'bob-agent', personId: <bob-agent> }`
- **THEN** the credential is created with the member as issuer, and a token for it acts as
  the member's account with scopes `read` and `write` only

#### Scenario: A member issues for a stranger's agent

- **WHEN** a caller with role `member` names an agent person bound to another account
- **THEN** WBS answers `403 forbidden` and writes no credential and no audit row

#### Scenario: Pinning a stranger's person

- **WHEN** an admin of A names a person owned by B, or a person of kind `human`
- **THEN** WBS answers `404 unknown_person` and writes nothing

#### Scenario: Pinning an unbound person

- **WHEN** an admin names an agent person whose `accountId` is null
- **THEN** WBS answers `409 person_not_bound` naming the person, and writes nothing

### Requirement: An OIDC credential names a trusted issuer of the organization

For `source: 'oidc'` the body SHALL name a `trustedIssuerId` of the active organization, a
`subject` (1 to 512 characters, compared exactly) and optionally an `audience`. A trusted
issuer of another organization SHALL be refused `404 unknown_trusted_issuer`. The
`(issuer, subject)` pair SHALL be unique among unrevoked credentials of every organization;
a second is refused `409 subject_taken`.

#### Scenario: A GitHub Actions workflow is admitted

- **WHEN** an admin of A, whose trusted issuer T is `https://token.actions.githubusercontent.com`
  with default audience `wbs`, posts `{ source: 'oidc', trustedIssuerId: T, subject:
'repo:acme/wbs:ref:refs/heads/main', personId: <ci-agent> }`
- **THEN** the credential is listed with its issuer and subject and no secret, and a token
  minted by T for that subject and audience is admitted on the next request

#### Scenario: Another organization's trusted issuer

- **WHEN** an admin of A names a trusted issuer registered by B
- **THEN** WBS answers `404 unknown_trusted_issuer` and writes nothing

### Requirement: A human at the MCP consent page may authorize an agent person instead of themself

After activation, `POST /internal/mcp/organizations` SHALL answer, per admitted membership,
the agent persons of that organization bound to the signed-in account. mcp-01's consent
page SHALL offer "authorize as yourself" and one entry per such agent, and SHALL show the
page even for a single organization when any agent is offered; with no agent it SHALL
behave as today. Choosing an agent SHALL, before the code is issued and in the consent's
transaction, obtain from be-01 `POST /internal/mcp/credentials` one `machine_credential` of
source `mcp_consent` naming the organization, the agent person, the signed-in account as
issuer and the family about to be created, with its audit row; the refresh family and
every session from it SHALL carry that person and credential. be-01 SHALL refuse `403
person_not_bound` when the person is not bound to the signed-in account, is not an agent or
is of another organization, and `403 not_a_member` when the account is not a current
member; mcp-01 SHALL then answer the client `access_denied` and create no family. Before
activation the choice SHALL NOT be offered.

#### Scenario: Signing in with Google authorizes the agent

- **WHEN** Dany signs in at the consent page with Google and chooses agent `claire`
- **THEN** one `mcp_consent` credential exists under `claire` issued by Dany's account, the
  family is created for it, and the audit row names `claire` and Dany's account

#### Scenario: Choosing an agent of another account

- **WHEN** a signed-in human's consent names a person bound to another account
- **THEN** be-01 answers `403 person_not_bound`, mcp-01 answers `access_denied`, and no
  family and no credential exist

#### Scenario: One organization, no agents

- **WHEN** the signed-in account has one membership and no agent bound to it
- **THEN** the consent binds that organization without a choice page, as today

### Requirement: A consent family's tool calls act as the agent until the credential is revoked

Every tool call of a family that names a credential SHALL request its delegation from
`POST /internal/mcp/delegation` naming that credential. be-01 SHALL issue the delegation only
when the credential is unrevoked, names that family, its person is still bound to the
token's account and the account is a current member; the delegation SHALL carry the person
as pin and scopes narrowed to `read` and `write` within the grant. `POST
/internal/mcp/authority` SHALL answer revoked for a revoked or unbound credential, and
mcp-01 SHALL then end the family and refuse refresh as it does for a removed member. A
claim through such a delegation SHALL be accepted for the agent and for delegated claims
under its claims, and refused `credential_not_for_person` for any other person. The
organization's enforced SSO and session policy SHALL keep judging the human sign-in that
opened the family.

#### Scenario: The agent claims through its own session

- **WHEN** a tool call of the family for `claire` applies a `claimWorkItem` batch naming
  `claire`
- **THEN** the claim is accepted and records `claire`; a batch naming another person is
  refused `credential_not_for_person`

#### Scenario: Revoke ends the session

- **WHEN** Dany revokes `claire`'s consent credential on the people page
- **THEN** the family's next tool call is refused `401`, its refresh is refused, and the
  audit holds one `machine_credential_revoked` row

#### Scenario: The agent is unbound

- **WHEN** an admin unbinds `claire` from Dany's account while a consent credential is live
- **THEN** the `patchPerson` is refused `in_use` with `machineCredentials: 1`

#### Scenario: Refresh keeps the agent alive

- **WHEN** the family's refresh token is used after the access token expired
- **THEN** a new session for `claire` is issued and its next tool call still acts as `claire`

### Requirement: One verification path admits every source

be-01 SHALL admit a request bearing `Authorization: Bearer <token>` by exactly one of: a
WBS-signed delegation naming a live `mcp_consent` credential; an API key
`wbs_mk_<credential id>.<secret>` whose id selects an unrevoked credential by primary key
and whose secret's SHA-256 digest equals, compared in constant time, one of that
credential's unexpired secrets; a JWT verified against a trusted issuer's JWKS with the
credential's audience (or the issuer's default) whose pair is an unrevoked `oidc` credential
of that trusted issuer. A JWT of the configured issuer with a groups claim SHALL keep the
browser login path; one without a groups claim SHALL be refused `401 unknown_identity` with
no credential lookup and no account created, whatever `external_identity` rows exist. A `wbs_mk_` token SHALL never be parsed as a JWT, SHALL never be matched by scanning digests,
and a malformed one (no `.`, or an id that is no credential) SHALL be refused `401
unknown_identity` without a read. No header other than `Authorization` SHALL carry a key. A verified token
matching no credential, a revoked credential or an expired secret SHALL be refused `401
unknown_identity` with no account created or changed. A token whose issuer is neither the
configured issuer nor a trusted issuer, an unverifiable token or a key set that cannot be
fetched SHALL be refused `401 invalid_token`, never admitted on a cached or default key.

#### Scenario: An API key is admitted

- **WHEN** a request bears a live API key of credential C of organization A
- **THEN** it is admitted as C's person's account with scopes `read` and `write`, bound to A
  without any cookie, and `GET /api/projects` lists A's projects only

#### Scenario: A secret under another credential's id

- **WHEN** a request bears `wbs_mk_<id of credential A>.<live secret of credential B>`
- **THEN** WBS answers `401 unknown_identity` and reads only credential A's secrets

#### Scenario: A key in a custom header

- **WHEN** a request carries a live key in `x-wbs-api-key` and no `Authorization` header
- **THEN** it is treated as unauthenticated, exactly as a request with no credential

#### Scenario: A revoked API key

- **WHEN** a request bears the secret of a revoked credential
- **THEN** WBS answers `401 unknown_identity` and the users table is unchanged

#### Scenario: A machine-to-machine token of the configured issuer

- **WHEN** a verified JWT of the configured issuer arrives without a groups claim
- **THEN** WBS answers `401 unknown_identity`, reads no credential, and the users table is
  unchanged

#### Scenario: A trusted issuer's token for an unknown subject

- **WHEN** a JWT verified against trusted issuer T carries a subject no credential of T names
- **THEN** WBS answers `401 unknown_identity` and no account is created

#### Scenario: A token of a stranger issuer

- **WHEN** a JWT's `iss` is neither the configured issuer nor any organization's trusted issuer
- **THEN** WBS answers `401 invalid_token` without fetching any key set

#### Scenario: The key set cannot be fetched

- **WHEN** trusted issuer T's JWKS endpoint answers 503
- **THEN** the request is refused `401 invalid_token`, the failure is reported, and no
  cached key of another issuer is tried

#### Scenario: A pair shared by two organizations' issuers

- **WHEN** A and B both trust the same issuer URL and only A holds a credential for subject S
- **THEN** a token for S is admitted as A's credential and B gains nothing

### Requirement: A machine token acts as its pinned person's account with capped scopes

A request admitted by a machine credential SHALL act as the account the pinned person is
bound to, with scopes exactly `read` and `write`, bound to the credential's organization,
and with the credential's person as the pin the claim decision reads. Organization
administration routes SHALL refuse it `403 insufficient_scope`. A claim or release naming
another person, outside a delegated claim under the pinned person's claim, SHALL be refused
`credential_not_for_person` as today. An account no longer a member of the credential's
organization SHALL be refused `403 not_a_member` with the credential unchanged. Enforced SSO
and the session policy SHALL NOT refuse a machine token.

#### Scenario: An admin's account, a member's reach

- **WHEN** a credential's person is bound to an account holding `super_admin` in A
- **THEN** a command batch on A's project is accepted and `GET /api/organization/members`
  is refused `403 insufficient_scope`

#### Scenario: A claim for the wrong person

- **WHEN** a machine token pinned to `claire` claims a step as `claude-code` outside any
  subtree claim of `claire`
- **THEN** the batch is refused `credential_not_for_person` and writes nothing

#### Scenario: A delegated claim keeps working

- **WHEN** `claire` holds a subtree claim and a token pinned to `claire-worker`, bound to
  the same account, claims a leaf under it naming that claim as parent
- **THEN** the claim is accepted exactly as under the operator-linked credential

#### Scenario: Enforced SSO does not refuse a machine

- **WHEN** A enforces SSO and a request bears A's live API key
- **THEN** the request is admitted

### Requirement: An admin lists credentials with their last use

`GET /api/organization/machine-credentials` SHALL list every unrevoked credential of the
active organization for an admin, and for a member only those whose person is bound to the
caller's account; `?personId=` narrows to one person. Each row carries id, source, name, person, issuer account, issuer URL and subject
where present, the OAuth client name for `mcp_consent`, creation time, `lastUsedAt` (null until first use, coarse to the minute) and
the secret ids with their expiries for `api_key`. It SHALL never carry a secret or a digest.
A revoked credential SHALL be listed only when `?include=revoked` is asked, with its
`revokedAt`. A viewer SHALL be refused `403 forbidden`.

#### Scenario: Last use after a request

- **WHEN** a credential's API key is used at 10:00:30 and again at 10:00:50
- **THEN** the list shows one `lastUsedAt` at or before 10:00:30 and no second write
  happened within the minute

#### Scenario: A member lists

- **WHEN** a caller with role `member` lists while the organization holds credentials of two
  persons, one bound to the caller's account
- **THEN** only that person's credentials are listed

### Requirement: Rotation overlaps for a bounded window

`POST /api/organization/machine-credentials/:id/rotate` on an `api_key` credential SHALL issue
a new secret, shown once as `wbs_mk_<the same credential id>.<new secret>`, and give the
previous secret `expiresAt` 24 hours later, in one transaction with a
`machine_credential_rotated` audit row. During the window both secrets SHALL be admitted
under the one credential id; after it the previous one SHALL be `401 unknown_identity`. A second rotation
inside the window SHALL be refused `409 rotation_in_progress`. On an `oidc` or
`mcp_consent` credential rotation SHALL be refused `409 rotation_at_issuer`. A credential of
another organization, a revoked one, or for a member one whose person is not bound to the
caller's account SHALL be `404 not_found`.

#### Scenario: Both secrets live, then one

- **WHEN** an admin rotates C at T0
- **THEN** the new key carries C's unchanged id, C's old secret is admitted at T0 + 23 h and
  refused `401 unknown_identity` at T0 + 25 h, while the new secret is admitted at both

#### Scenario: Rotating an OIDC credential

- **WHEN** an admin rotates an `oidc` credential
- **THEN** WBS answers `409 rotation_at_issuer` and changes nothing

### Requirement: Revocation is immediate and audited

`DELETE /api/organization/machine-credentials/:id` SHALL set `revokedAt`, end every secret,
and write a `machine_credential_revoked` row in one transaction. The next request bearing any
of its secrets or tokens SHALL be `401 unknown_identity`. A second revoke, and for a member a credential whose person is not bound to the caller's
account, SHALL be `404 not_found`. Deleting a person with live credentials SHALL be refused `in_use` with the
`machineCredentials` count unless cascaded; the cascade SHALL revoke and remove them in the
same transaction. Unbinding or rebinding such a person through `patchPerson` SHALL be
refused `in_use` likewise.

#### Scenario: Revoke ends a token mid-window

- **WHEN** an admin revokes C while C is inside a rotation window
- **THEN** both of C's secrets are refused `401 unknown_identity` on the next request

#### Scenario: Removing a pinned person

- **WHEN** `deletePerson` names a person with one live credential, without `cascade`
- **THEN** it is refused `in_use` with `machineCredentials: 1` and changes nothing

### Requirement: An admin registers and removes trusted issuers

`POST /api/organization/trusted-issuers` SHALL be accepted from an admin with an `issuer`
HTTPS URL, an optional `defaultAudience` and an optional `ssoConnectionId`. WBS SHALL fetch
the issuer's OIDC discovery document once, require its `issuer` to equal the given URL and
record its `jwks_uri`; an unreachable document SHALL be `409 issuer_unreachable`, a
disagreeing one `409 issuer_mismatch`, and nothing is stored in either case. The configured
issuer SHALL be refused `409 issuer_reserved`. With `ssoConnectionId` the connection SHALL be
the organization's, of strategy `oidc` (`409 issuer_not_oidc` otherwise) and proven (`409
sso_connection_unproven`). `(organization, issuer)` SHALL be unique (`409 issuer_taken`).
`DELETE /api/organization/trusted-issuers/:id` SHALL be refused `409 in_use` with the count
while unrevoked credentials name it. Each act SHALL write its audit row in the same
transaction.

#### Scenario: Registering a workload identity issuer

- **WHEN** an admin posts `https://token.actions.githubusercontent.com` with default audience `wbs`
- **THEN** the trusted issuer is listed with the discovered `jwks_uri`, and one
  `trusted_issuer_registered` row records it

#### Scenario: A SAML connection as the gate

- **WHEN** an admin names a proven `samlp` connection
- **THEN** WBS answers `409 issuer_not_oidc` and stores nothing

#### Scenario: Discovery disagrees

- **WHEN** the document at the URL publishes a different `issuer`
- **THEN** WBS answers `409 issuer_mismatch` and stores nothing

#### Scenario: Removing an issuer in use

- **WHEN** an admin deletes a trusted issuer two unrevoked credentials name
- **THEN** WBS answers `409 in_use` with `machineCredentials: 2` and changes nothing

### Requirement: The people page shows and revokes an agent's credentials

An agent person's row on the people page SHALL show the count of its live credentials and
open a list of them (source, name, issuer account, last use, client name for
`mcp_consent`) with a revoke action under the same exact-id confirmation as the
organization panel. A member SHALL see and revoke only credentials of agents bound to
their own account; an admin every agent's. The list SHALL render loading, empty, rows and
failure states and SHALL never show a secret.

#### Scenario: Revoke from the people page

- **WHEN** Dany opens `claire` on the people page and revokes her consent credential with its
  exact id
- **THEN** one revoke request is sent, the row's count drops by one, and no secret was shown

#### Scenario: A member sees only their own agents' credentials

- **WHEN** a member opens an agent bound to another account
- **THEN** no credentials list is offered and no credentials request is sent

### Requirement: The organization page administers credentials

The organization page SHALL compose a separate Machine credentials panel using the captured
organization resource client, visible to members and admins and not to viewers; a member's
panel lists and acts on their own agents' credentials only, and the trusted issuers section
renders for admins only. It SHALL
render loading, empty, rows, transport failure and modeled refusal states. Only a successful
read permits writes; writes and refresh serialize. Create and rotate SHALL display the
returned secret only in ephemeral component state with a dismiss action, a copy-now warning
and a read-only focusable field whose whole value can be selected; refresh, a later mutation,
a refusal and unmount SHALL discard it; a metadata failure after a successful create or rotate
SHALL keep the secret retrievable while showing the failure. Revoke SHALL require the exact
selected credential id. Rows SHALL show source, person, last use with its minute coarseness,
and for `api_key` the rotation window end when one is open; `oidc` and `mcp_consent` rows
offer no rotate control. Loss of access SHALL withdraw the panel with the page.

#### Scenario: Secret shown once, then gone

- **WHEN** an admin creates an API key and then triggers a refresh
- **THEN** the secret was shown with the warning and the copyable field, and after the
  refresh no secret is rendered or retained in state

#### Scenario: Exact confirmation

- **WHEN** an admin enters a different id in the revoke confirmation
- **THEN** no request is sent

#### Scenario: A viewer opens the page

- **WHEN** a viewer views the organization page
- **THEN** the credentials panel is not rendered and no credentials request is sent
