## ADDED Requirements

### Requirement: A super-admin records one enterprise connection per verified domain

Only a current super-admin of an activated organization SHALL create, update or delete an enterprise connection. A connection SHALL name the Auth0 connection, a strategy of `samlp` or `oidc`, a unique login slug, and one domain claim of the active organization. That claim SHALL be `verified` when the connection is created. A domain claim SHALL have at most one enterprise connection. A connection SHALL be created unproven and unenforced. While a connection exists on a domain, releasing that domain SHALL be refused. While the organization has a live provisioning token, deleting its connection SHALL be refused. Before activation, every connection route SHALL refuse.

#### Scenario: Create on a verified domain

- **GIVEN** a current super-admin of organization A, which owns verified `acme.test`
- **WHEN** they create a connection `acme-saml`, `samlp`, slug `acme`, on that claim
- **THEN** the connection exists unproven and unenforced, and one audit row records it in the same transaction

#### Scenario: Unverified or suspended domain refused

- **GIVEN** A's claim on `acme.test` is `pending` or `suspended`
- **WHEN** a super-admin creates a connection on it
- **THEN** WBS answers `409 domain_not_verified` and stores nothing

#### Scenario: Second connection on one domain refused

- **GIVEN** `acme.test` already has a connection
- **WHEN** a super-admin creates another on the same claim
- **THEN** WBS answers `409 sso_connection_exists` and stores nothing

#### Scenario: Non-super-admin, foreign claim and inactive organization refused

- **GIVEN** an admin of A, a super-admin of A naming B's claim, or an organization before activation
- **WHEN** each tries to create, update or delete a connection
- **THEN** the admin receives `403`, the foreign claim answers `404` as if absent, the inactive organization receives `403`, and nothing changes

#### Scenario: Domain release blocked by a connection

- **GIVEN** `acme.test` has a connection
- **WHEN** a super-admin releases the domain
- **THEN** WBS answers `409 sso_connection_exists` and the claim stays verified

#### Scenario: Connection deletion blocked by live provisioning

- **GIVEN** A has a live provisioning token
- **WHEN** a super-admin deletes A's only connection
- **THEN** WBS answers `409 provisioning_active` and the connection remains

### Requirement: A connection is proven by a routed link before it can be enforced

A connection SHALL become proven only when a current super-admin of its organization completes the explicit identity link routed through that connection's slug, and the pair it adds has a subject that starts with the subject prefix `{strategy}|{auth0 connection}|` (the whole prefix, including the final `|`) and an email on the connection's domain. Proving and adding the pair SHALL commit in one transaction. At most one proven connection SHALL name a given Auth0 connection. A routed link whose subject lacks the prefix SHALL leave the connection unproven, record when the mismatch happened, and answer `?auth_link=sso_prefix_mismatch`. Enforcement SHALL be switchable on only for a proven connection.

#### Scenario: Fixture subject proves the connection

- **GIVEN** connection `acme-saml` (`samlp`) on `acme.test`, and super-admin S of A
- **WHEN** S completes a link routed with `organization=acme` that returns subject `samlp|acme-saml|alice@acme.test` with email `alice@acme.test`
- **THEN** the pair is added to S, the connection is proven by S, and one audit row records the proof

#### Scenario: Wrong prefix leaves the connection unproven

- **GIVEN** the same connection
- **WHEN** the routed link returns `samlp|other|alice@acme.test`, `samlp|acme-saml-2|alice@acme.test`, `samlp|alice@acme.test` or `google-oauth2|1`
- **THEN** the connection stays unproven, the mismatch time is recorded, and the link answers `sso_prefix_mismatch`

#### Scenario: Proof by a non-super-admin refused

- **GIVEN** a member M of A who is not a super-admin
- **WHEN** M completes a routed link with a matching subject
- **THEN** the pair may be linked to M, but the connection stays unproven

#### Scenario: Second organization cannot prove the same Auth0 connection

- **GIVEN** A's connection `acme-saml` is proven, and organization B created an unproven connection also naming `acme-saml`
- **WHEN** a super-admin of B completes a routed link through B's slug with a matching subject
- **THEN** B's connection stays unproven and B's super-admin receives `sso_connection_taken`

#### Scenario: Enforcing an unproven connection refused

- **GIVEN** an unproven connection
- **WHEN** a super-admin sets it enforced
- **THEN** WBS answers `409 sso_connection_unproven` and nothing changes

### Requirement: Login is routed to the enterprise connection

`GET /api/auth/login` SHALL accept at most one of `organization=<slug>`, `email=<address>` and `method=<id>`. A known slug SHALL send `connection=<auth0 connection>` to the provider. An email whose canonical domain is a verified claim with a connection SHALL route the same way. Any other email SHALL continue as the ordinary login without `connection`. If the organization has a session policy, a routed login SHALL also send `prompt=login`. A suspended claim SHALL NOT route by email. The routed connection SHALL NOT grant authority on its own.

#### Scenario: Slug routes to the connection

- **GIVEN** slug `acme` names connection `acme-saml`
- **WHEN** a browser requests `/api/auth/login?organization=acme`
- **THEN** the redirect to `/authorize` carries `connection=acme-saml`

#### Scenario: Verified-domain email routes to the connection

- **GIVEN** `acme.test` is verified for A with a connection
- **WHEN** a browser requests `/api/auth/login?email=Bob@ACME.test`
- **THEN** the redirect carries that connection

#### Scenario: Other and suspended domains do not route

- **GIVEN** `other.test` has no connection, and `acme.test`'s claim is suspended
- **WHEN** a browser requests login with an email on either domain
- **THEN** the redirect carries no `connection` parameter

#### Scenario: Ambiguous or malformed query refused

- **GIVEN** any configuration
- **WHEN** login receives both `organization` and `method`, both `email` and `organization`, a malformed email, or a malformed slug
- **THEN** WBS answers `400 invalid_query` and saves no transaction

#### Scenario: Unknown slug refused

- **GIVEN** no connection has slug `nope`
- **WHEN** a browser requests `/api/auth/login?organization=nope`
- **THEN** WBS answers `404 sso_connection_not_found` and saves no transaction

### Requirement: Enforced SSO admits only identities carrying the connection's subject prefix

In an organization whose proven connection is enforced, the organization context SHALL be issued and resolved only for a credential whose authenticating upstream subject starts with that connection's subject prefix. This SHALL hold at browser selection, at every resolution of an existing browser binding (including gateway browser access), at direct context issue, and at delegation verification. A first-party password credential has no upstream subject and SHALL be refused. Another pair linked to the same user SHALL NOT satisfy the rule. The refusal SHALL be typed `403 sso_required`, naming the organization and its SSO login and link paths, and SHALL apply only to that organization's context. Membership listing SHALL mark such an organization as requiring SSO for the current credential. Switching enforcement on SHALL be refused when the acting super-admin's own current credential would fail the rule.

#### Scenario: SSO identity admitted

- **GIVEN** A enforces `acme-saml`, and member M is signed in with subject `samlp|acme-saml|m@acme.test`
- **WHEN** M selects A and calls a protected A route
- **THEN** both succeed

#### Scenario: Social identity refused in the enforced organization only

- **GIVEN** A enforces `acme-saml`, and member M of A and of B is signed in with `google-oauth2|7`
- **WHEN** M selects A, and then selects B
- **THEN** selecting A answers `403 sso_required` with A's SSO login path and writes no binding
- **AND** selecting B succeeds

#### Scenario: Linked SSO pair does not lend authority to a social credential

- **GIVEN** M's account holds both `google-oauth2|7` and `samlp|acme-saml|m@acme.test`, and M's current credential was authenticated by `google-oauth2|7`
- **WHEN** M selects A
- **THEN** WBS answers `403 sso_required`

#### Scenario: Password credential refused

- **GIVEN** A enforces SSO, and member P is signed in with a WBS password
- **WHEN** P selects A or requests a direct context for A
- **THEN** both answer `403 sso_required`

#### Scenario: Enforcement applies to an existing binding at once

- **GIVEN** M selected A with `google-oauth2|7` before enforcement
- **WHEN** a super-admin enables enforcement and M's next A request arrives
- **THEN** that request answers `403 sso_required`, and M's gateway subscriptions to A close within the existing lease bound

#### Scenario: Delegation with a non-matching subject refused

- **GIVEN** A enforces SSO, and an MCP delegation for A carries upstream subject `github|9`
- **WHEN** be-01 verifies it on a tool call
- **THEN** the call answers `403 sso_required` and nothing executes

#### Scenario: Super-admin cannot lock themself out

- **GIVEN** super-admin S of A is signed in with `google-oauth2|1`, and A's connection is proven
- **WHEN** S sets the connection enforced
- **THEN** WBS answers `409 enforcement_would_lock_out_actor` and enforcement stays off
