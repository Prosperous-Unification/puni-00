## ADDED Requirements

### Requirement: Sign-in methods are an enabled subset of a closed catalogue

The system SHALL offer sign-in methods only from the catalogue `google`, `github`, `email`, `apple`,
enabled by the required `AUTH_METHODS` setting in OIDC mode, and SHALL refuse to start when that
setting is missing, empty, names an unknown or repeated method, or mixes `none` with methods.

#### Scenario: enabled methods are listed without a session

- **WHEN** `AUTH_METHODS=google,github,email` and a browser without cookies requests `GET /api/auth/methods`
- **THEN** the reply is 200 with those three methods and their labels in catalogue order and sets no cookie

#### Scenario: none keeps the provider chooser only

- **WHEN** `AUTH_METHODS=none`
- **THEN** `GET /api/auth/methods` answers an empty list and the sign-in card shows only the SSO link

#### Scenario: malformed configuration fails boot

- **WHEN** `AUTH_METHODS` is missing, empty, `google,google` or `facebook` in OIDC mode
- **THEN** be-01 refuses to start and names the variable

### Requirement: A login may name an enabled method

`GET /api/auth/login` SHALL accept an optional `method`; an enabled method MUST send its provider
connection with the authorization request, and a method that is not enabled MUST be refused with
`400 invalid_query` before any login transaction or binding cookie is created.

#### Scenario: an enabled method selects its connection

- **WHEN** `google` is enabled and a browser requests `GET /api/auth/login?method=google`
- **THEN** the reply is a 302 whose location carries `connection=google-oauth2` and one transaction is saved

#### Scenario: a disabled method is refused before any state

- **WHEN** `apple` is not enabled and a browser requests `GET /api/auth/login?method=apple`
- **THEN** the reply is `400 invalid_query`, no transaction is saved and no cookie is set

#### Scenario: no method keeps the chooser

- **WHEN** a browser requests `GET /api/auth/login`
- **THEN** the authorization request carries no connection

### Requirement: An email collision is a rendered refusal

A login callback whose unmapped identity carries a verified email another account holds SHALL
redirect to `/?auth_error=account_exists`, write nothing, issue no session and name no provider.

#### Scenario: a second method with a held email

- **WHEN** user A holds `a@x.test` through `google-oauth2|1` and a callback arrives for `github|2` with verified `a@x.test`
- **THEN** the reply is `302 /?auth_error=account_exists`, no user or mapping is written and the consumed binding is cleared

#### Scenario: an unverified address never reveals a registration

- **WHEN** a callback for an unmapped `github|9` carries `a@x.test` without `email_verified` and another account holds `a@x.test`
- **THEN** a new user is created with no address and `email_verified` false, the browser is signed in, and no `account_exists` refusal is answered

### Requirement: One user may hold several verified identities

The identity store SHALL let one user hold several mapped `(issuer, subject)` pairs, MUST keep each
pair mapped to at most one user, MUST throw when a user's own pair is unmapped or mapped to another
user, and MUST answer an explicit link of an already-mapped pair as `linked` for the same user and
`identity_collision` for another.

#### Scenario: a linked second pair resolves to the same user

- **WHEN** user G holds `google-oauth2|1` and has linked `github|2`
- **THEN** a login or Bearer credential with either subject resolves to G

#### Scenario: relinking is idempotent

- **WHEN** G links `github|2` again
- **THEN** the outcome is `linked` and one mapping row exists

#### Scenario: a pair held by another user collides

- **WHEN** `github|2` is mapped to user H and G links it
- **THEN** the outcome is `collision` and neither G nor H changes

#### Scenario: corrupt own pair throws

- **WHEN** G's own pair is not mapped to G and G links or signs in
- **THEN** the operation throws and no mapping is written

### Requirement: An OIDC session can add a sign-in method

`POST /api/auth/link/auth0` SHALL accept an OIDC session without a password, re-verifying its access
token and resolving it through existing mappings only; a password session MUST still prove a fresh
password; a password sent with an OIDC session MUST be refused with `400 invalid_body`; an optional
`method` MUST pass the enabled method's connection with `prompt=login`.

#### Scenario: a Google user adds GitHub

- **WHEN** an activated Google session posts `{ method: 'github' }` and the callback returns a verified `github|2`
- **THEN** the start answers 200 with a location carrying `prompt=login` and `connection=github`, and the callback adds the pair and redirects to `/?auth_link=linked`

#### Scenario: a password session still needs its password

- **WHEN** a password session posts `{ method: 'github' }` without a password
- **THEN** the reply is `401 invalid_credentials`

#### Scenario: an expired OIDC token cannot start a link

- **WHEN** the access cookie no longer verifies
- **THEN** the reply is `401 invalid_credentials` and no provider location is answered

#### Scenario: the account lists its linked methods

- **WHEN** a signed-in user holds `google-oauth2|1` and `github|2` at the configured issuer
- **THEN** `GET /api/auth/me` reports `linkedMethods` `google` and `github`, read from the mappings and not from token claims
