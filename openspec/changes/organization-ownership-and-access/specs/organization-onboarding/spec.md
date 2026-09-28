## ADDED Requirements

### Requirement: Verified identity chooses an onboarding path

After sign-in, a user without membership SHALL establish a verified email before creating an organization, accepting an invitation or requesting to join. If its exact domain belongs to a verified organization, WBS SHALL show that organization and offer a join request or invitation acceptance; organization creation through that address MUST be refused. Otherwise the user SHALL be able to create an organization and become its first super-admin atomically. Creation SHALL NOT claim the email domain. Existing members SHALL be able to select an active membership even without a verified email. A verified email on a public domain SHALL remain eligible to create an organization. Onboarding discovery and writes SHALL require a session principal; a delegation SHALL receive a typed 403 without revealing memberships or changing onboarding state. Onboarding writes SHALL require the session's write scope.

#### Scenario: Delegated onboarding

- **GIVEN** a verified delegation bound to one organization
- **WHEN** it requests onboarding discovery, organization creation or a join request
- **THEN** each request receives 403 without revealing memberships or writing an organization, membership or request

#### Scenario: Read-only session onboarding write

- **GIVEN** a session with read scope and no write scope
- **WHEN** it requests organization creation or join submission
- **THEN** the request receives `insufficient_scope` without changing onboarding state

#### Scenario: Existing member without verified email

- **GIVEN** a signed-in user with a current membership and no verified email
- **WHEN** the user discovers onboarding after activation
- **THEN** discovery offers membership selection

#### Scenario: Matching company domain

- **GIVEN** `example.org` is verified for organization A and a new user has a verified `@example.org` address
- **WHEN** they finish sign-in
- **THEN** onboarding names A and offers a join request, with no project access or organization-creation path

#### Scenario: Unverified email

- **GIVEN** an identity whose email is missing or unverified
- **WHEN** the user enters onboarding
- **THEN** organization creation, invitation acceptance and join request are refused until email verification is established

#### Scenario: First owner

- **GIVEN** a verified user whose domain has no verified owner
- **WHEN** they create an organization
- **THEN** the organization and their super-admin membership commit together

#### Scenario: Activation and durable OIDC evidence

- **GIVEN** onboarding is inactive, or a signed-in user has no stored verified email
- **WHEN** they discover or mutate onboarding
- **THEN** the inactive deployment refuses with `onboarding_inactive` and writes nothing; after activation discovery shows `verification_required`, and writes refuse with `email_verification_required`
- **AND** only a validated OIDC callback carrying literal `email_verified: true` sets durable verification; an absent or false claim clears it without changing the issuer/subject mapping

#### Scenario: Exact matching and public email

- **GIVEN** an exact verified claim for `example.org`
- **WHEN** a verified `@example.org` user discovers onboarding or attempts creation
- **THEN** discovery names that organization and creation refuses with `domain_matched`
- **AND** `@sub.example.org`, suspended claims and public-email domains do not match it; an unmatched verified address may create without claiming its domain

#### Scenario: Concurrent first-owner creation

- **GIVEN** a verified user without memberships or a matching claim
- **WHEN** two connections create an organization for the same user concurrently, or membership insertion fails
- **THEN** at most one organization and its first super-admin membership commit; a failed membership insert rolls the organization back

### Requirement: Password-only accounts can establish verified email without changing identity

An existing first-party username/password account without verified email SHALL retain its local WBS user ID and password sign-in. Its authenticated owner SHALL be offered a rendered path to add an email, receive a single-use expiring verification challenge at that address, and confirm possession before any organization creation, invitation acceptance or join request. Alternatively, the owner MAY link an Auth0 identity through a fresh authenticated Auth0 flow whose verified email is established by Auth0; WBS SHALL bind its verified issuer/subject to the same local user ID only after proving control of both sessions. Matching email alone SHALL never merge accounts. Expired, replayed, mismatched or unverified proofs and issuer/subject collisions SHALL refuse linking and onboarding without changing the local ID or granting membership. Lost delivery, expired challenge, collision and query failure SHALL have distinct rendered recovery or support paths.

After activation, `POST /api/auth/link/auth0` SHALL require an originating first-party password session that remains enabled and a freshly verified password admitted by the shared password throttle, and SHALL begin an Auth0 code flow with its own redirect URI, state, nonce and PKCE verifier. Exhausted throttle capacity SHALL answer 429 `invalid_credentials` and release every admitted attempt after success, refusal or verifier error. `GET /api/auth/link/auth0/callback` SHALL consume only the matching unexpired browser binding and original password session while password sessions remain enabled, require Auth0's verified email, and insert the issuer/subject mapping and verified email in one immediate transaction against current activation and ownership. The email SHALL use activated OIDC login's canonical domain validation before ownership checking or persistence. The link flow SHALL never create an account or issue a new session. Before activation, start SHALL answer 403 `onboarding_inactive`. A bad password SHALL answer 401 `invalid_credentials`; a missing, swapped or replayed callback proof SHALL answer a bodyless 401; malformed provider parameters SHALL answer a bodyless 400; identity or email ownership collision SHALL answer a bodyless 409. Trusted marker corruption SHALL throw.

#### Scenario: Password account verifies an address

- **GIVEN** a password-only account with local user ID U and no verified email
- **WHEN** U confirms a fresh single-use challenge sent to its new address
- **THEN** U keeps the same local ID and may continue onboarding with that verified address

#### Scenario: Password challenge delivery and consumption

- **GIVEN** activation is complete and U is signed in with a password-only account
- **WHEN** U requests a normalized address challenge through an injected mail sink and confirms its 30-minute token
- **THEN** WBS stores only the token digest, marks the challenge delivered before confirmation, consumes it once in an immediate transaction, and updates U's existing email and verification flag without changing U's ID
- **AND** pending or failed delivery, expiry, revocation, wrong account, replay and address conflict refuse without verifying U; an inactive marker refuses both routes
- **AND** until an internationalized-address policy matches the existing SQLite email uniqueness rule, the challenge routes refuse non-ASCII addresses with typed `400 invalid_body`
- **AND** the production sink currently refuses delivery with typed `503 delivery_failed` until a reviewed delivery adapter is provided

#### Scenario: Auth0 link collision

- **GIVEN** a password-only account U and an Auth0 issuer/subject already mapped to V
- **WHEN** U attempts to link that Auth0 identity, even if their emails match
- **THEN** linking and onboarding are refused without merging U and V or changing either ID

#### Scenario: Swapped or replayed Auth0 callback

- **GIVEN** U began an explicit link with a current password session and fresh password proof
- **WHEN** the callback arrives with another password session, a mismatched state, or an already consumed binding
- **THEN** it is refused without changing either account; a mismatched arrival does not consume U's honest pending proof

### Requirement: Invitations are bound and single use

An authorized administrator SHALL create a revocable invitation for one normalized verified recipient email, organization and permitted role with an expiry. Only the matching currently verified email SHALL accept it. Acceptance SHALL consume the invitation and create or retain one membership atomically; expiry, revocation, concurrent acceptance and replay MUST be refused. Admins SHALL only invite viewer or member; super-admins SHALL also invite admin. An invitation SHALL NOT directly grant super-admin.

The active-organization GET/POST `/api/organization/invitations` and DELETE `/api/organization/invitations/:id` SHALL recheck administrator authority in their store transaction. An admin SHALL NOT revoke an admin offer. A foreign or missing invitation id SHALL have the same 404. POST `/api/onboarding/invitations/accept` SHALL require a session with write scope, read the current durable verified email, and answer 403 for a recipient mismatch or missing verification, 404 for an unknown token, and 409 for an expired, revoked or consumed offer. Acceptance SHALL retain an existing membership's role without upgrading it. Issuance SHALL use the injected mail port, store only a token digest, and answer 503 while delivery fails. All four routes SHALL refuse before activation; delegated callers SHALL receive 403.

#### Scenario: Invitation replay

- **GIVEN** an invitation has been accepted once
- **WHEN** the recipient or another caller submits it again
- **THEN** acceptance is refused and no additional membership is created

#### Scenario: Address and expiry binding

- **GIVEN** an invitation addressed to `a@example.org`
- **WHEN** a user verified as `b@example.org` accepts it, or the invitation has expired
- **THEN** acceptance is refused without consuming a valid invitation for `a@example.org`

### Requirement: Join requests require administrator approval

A verified-email user SHALL be able to submit at most one pending request to a matching verified organization. A current admin or super-admin SHALL approve it as viewer or member, or deny it, using the requester's current verified email and organization state. Approval SHALL issue one addressed invitation atomically; request submission, approval and denial SHALL grant no membership until the recipient accepts that invitation. Admin membership and super-admin grants SHALL require the super-admin invitation or role-change path.

The active-organization GET `/api/organization/join-requests` SHALL list requests only to current administrators. POST `/:id/approve` SHALL accept only `viewer` or `member`, recheck the requester's durable verified address against the submitted address and the organization's exact currently verified domain in an immediate transaction, and resolve the request with one seven-day digest-only invitation. POST `/:id/deny` SHALL resolve a pending request without changing membership or invitation state. Both decisions SHALL recheck administrator authority in the committing transaction and answer identical `404 not_found` for foreign and absent ids, `409 request_resolved` for replay, and approval SHALL answer `409 domain_changed` for changed or unverified email or a suspended, released or mismatched claim. The injected mail port SHALL deliver an approval token; delivery failure SHALL answer `503 delivery_failed`, revoke that offer, and reopen the request. All three routes SHALL refuse before activation and delegated callers SHALL receive 403.

#### Scenario: Approval after domain loss

- **GIVEN** a pending request made while the user's domain matched an organization
- **WHEN** the domain is no longer verified and an admin tries to approve it
- **THEN** approval is refused and no invitation or membership is created

#### Scenario: Concurrent approval

- **GIVEN** one pending join request
- **WHEN** two admins approve it concurrently
- **THEN** exactly one invitation is issued, no membership is created, and the second approval is refused as already resolved

#### Scenario: Pending submission and identical missing targets

- **GIVEN** a verified user whose exact domain has a currently verified owner
- **WHEN** they submit a request, then submit again
- **THEN** the first response is 201 with a pending request and no membership; the second refuses with `join_request_pending`
- **AND** an absent organization, another domain and a no-longer-verified claim all answer the same `404 not_found`

### Requirement: Organization administration has explicit rendered states

fe-01 SHALL provide onboarding, organization switching, a members page for invites, roles, removal and pending requests, and domain settings. Loading, no memberships, empty lists, expired invite, query failure and lost permissions SHALL render distinct states. A stale tab SHALL not retain foreign organization data after switch or membership removal.

#### Scenario: Membership removed in another session

- **GIVEN** a member has a members page open
- **WHEN** that membership is removed and the page refreshes or receives a refusal
- **THEN** it clears organization data and renders the no-access state
