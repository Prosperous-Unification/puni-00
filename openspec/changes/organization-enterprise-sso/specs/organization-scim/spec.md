## ADDED Requirements

### Requirement: A super-admin issues, rotates and revokes provisioning tokens

Only a current super-admin of an activated organization with a proven enterprise connection SHALL issue a provisioning token. A token SHALL be 256 random bits, shown once in the issue response, and stored only as its SHA-256 digest. An organization SHALL have at most two live tokens. Rotation SHALL issue a new token and make the previous one expire 24 hours later. Revocation SHALL take effect immediately. Every issue, rotation and revocation SHALL write one audit row in the same transaction, and that row SHALL hold neither the token nor its digest.

#### Scenario: Issue shows the secret once

- **GIVEN** a super-admin of A, whose connection is proven
- **WHEN** they issue a token
- **THEN** the response carries the secret, storage holds only its digest, and listing tokens shows only the id, creation time, expiry and revocation time

#### Scenario: Issue without a proven connection refused

- **GIVEN** A has no connection, or only an unproven one
- **WHEN** a super-admin issues a token
- **THEN** WBS answers `409 sso_connection_unproven` and stores nothing

#### Scenario: Third live token refused

- **GIVEN** A has two live tokens
- **WHEN** a super-admin issues another
- **THEN** WBS answers `409 token_limit` and stores nothing

#### Scenario: Rotation overlap

- **GIVEN** token T1 is live
- **WHEN** a super-admin rotates it
- **THEN** a new token T2 is returned, T1 keeps authenticating until 24 hours have passed, and after that T1 receives `401`

#### Scenario: Non-super-admin refused

- **GIVEN** an admin of A
- **WHEN** they list, issue, rotate or revoke tokens
- **THEN** each answers `403` and nothing changes

### Requirement: SCIM requests authenticate by provisioning token without revealing an organization

`/scim/v2/Users` and `/scim/v2/Users/:id` SHALL accept only `Authorization: Bearer <provisioning token>`. The token SHALL select the organization, and no header, path or body SHALL be able to choose it. A missing, malformed, unknown, expired or revoked token SHALL receive the same `401` SCIM error body, with no organization named. The request body SHALL NOT be read before the token is authenticated and admitted, and a body larger than 64 KiB SHALL be answered `413` and change nothing. After authentication, each token SHALL be limited to 300 requests per rolling 60 seconds. A request beyond that SHALL receive `429` with `Retry-After` and SHALL change nothing.

#### Scenario: Revoked token replay

- **GIVEN** token T was revoked
- **WHEN** a client replays T on GET, POST, PATCH or DELETE
- **THEN** each answers the same `401` body that an unknown token receives, and nothing changes

#### Scenario: Rate admission

- **GIVEN** token T has made 300 requests in the last 60 seconds
- **WHEN** it sends a PATCH
- **THEN** WBS answers `429` with `Retry-After` and does not apply the PATCH

### Requirement: SCIM Users subset with pending membership

WBS SHALL support these operations:

- `GET /scim/v2/Users`, optionally filtered by `userName eq` or `externalId eq`
- `POST /scim/v2/Users`
- `GET`, `PATCH` and `DELETE /scim/v2/Users/:id`

All bodies and errors SHALL follow RFC 7644. PUT and any other filter SHALL answer `501`.

POST SHALL require a `userName` email whose domain has an enterprise connection in the token's organization, SHALL refuse a duplicate `userName` within that organization with `409 uniqueness`, and SHALL create a pending membership when the record is active. A pending membership SHALL grant nothing.

The first sign-in or identity link whose upstream subject starts with the prefix of a proven connection of that organization, and whose email equals the record's `userName`, SHALL activate it. Activation SHALL create a `member` membership, or bind to an existing membership without changing its role, bind the pair to the record, and write one audit row, all in one transaction.

PATCH SHALL support `replace` of `active`, `externalId` and `userName`, with `userName` changeable only while unbound. Any other path SHALL be refused. An identifier belonging to another organization SHALL answer `404`, exactly as an absent identifier does.

#### Scenario: POST creates a pending membership

- **GIVEN** token T of A, and A's proven connection on `acme.test`
- **WHEN** T POSTs `userName` `carol@acme.test`
- **THEN** a SCIM user exists with a pending membership, carol has no access to A, and one audit row records the act

#### Scenario: First SSO login activates

- **GIVEN** carol's pending membership in A
- **WHEN** a sign-in returns subject `samlp|acme-saml|carol@acme.test` with email `carol@acme.test`, even with `email_verified` false
- **THEN** carol holds a `member` membership of A, the record is bound to her pair, and one audit row records the activation

#### Scenario: Non-SSO sign-in does not activate

- **GIVEN** carol's pending membership in A
- **WHEN** she signs in with `google-oauth2|5` and email `carol@acme.test`
- **THEN** no membership is created and the record stays pending

#### Scenario: Off-domain and duplicate POST refused

- **GIVEN** token T of A
- **WHEN** T POSTs `dave@other.test`, or POSTs `carol@acme.test` a second time
- **THEN** the first answers `400` with `scimType` `invalidValue`, the second answers `409` with `scimType` `uniqueness`, and nothing is stored

#### Scenario: Cross-organization PATCH refused

- **GIVEN** token T of A, and SCIM user U of organization B
- **WHEN** T PATCHes U's `active` to false
- **THEN** WBS answers `404`, and U and B's memberships are unchanged

#### Scenario: Unsupported operation

- **GIVEN** token T
- **WHEN** T sends PUT, or filters with `emails co "x"`
- **THEN** WBS answers `501` and nothing changes

### Requirement: Deprovisioning removes the membership and ends access in one transaction

`active=false` and DELETE on a bound SCIM user SHALL, in one transaction, delete that user's membership in the token's organization, revoke that user's browser organization bindings for that organization, and write one audit row. The user's other organizations and their identity SHALL be unaffected. Deleting the membership is the revocation: no separate binding state exists, and every browser binding resolution, gateway lease and delegation verification rechecks current membership on each request, so the user's next request in that organization is refused. On a pending record, deprovisioning SHALL remove only the pending membership. After DELETE, GET of the identifier SHALL answer `404`. `active=true` on an inactive bound record SHALL create a pending membership, never a restored role. Deprovisioning the organization's last super-admin SHALL be refused with `409`, SHALL change nothing, and its detail SHALL name the ownerless-organization recovery path.

#### Scenario: Deactivation ends access at once

- **GIVEN** bound member carol of A and of B, with a live A browser binding, an A gateway subscription and an A MCP grant
- **WHEN** T PATCHes carol `active=false`
- **THEN** her membership of A is gone and one audit row records the act, both in the same transaction
- **AND** her next A request answers `403`, her A subscription closes within the lease bound, her next A tool call is refused, and her B access is unchanged

#### Scenario: Audit failure rolls the deprovision back

- **GIVEN** bound member carol of A
- **WHEN** T deprovisions her and the audit row cannot be written
- **THEN** the SCIM request fails with `500`, and carol's membership and bindings are unchanged

#### Scenario: Last super-admin refused

- **GIVEN** carol is A's only super-admin
- **WHEN** T PATCHes her `active=false` or DELETEs her
- **THEN** WBS answers `409` with `scimType` `mutability` and detail `last_super_admin`, which names the recovery path in `organization-ownership-and-access`, and nothing changes

#### Scenario: Reactivation does not restore the role

- **GIVEN** former admin carol's record in A is inactive and bound
- **WHEN** T PATCHes `active=true`
- **THEN** carol has a pending membership only, and after her next SSO sign-in she is a `member`
