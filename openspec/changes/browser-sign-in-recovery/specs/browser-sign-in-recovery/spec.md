## ADDED Requirements

### Requirement: Explicit browser cookie reset

The sign-in screen SHALL offer **Reset browser session** for an unverified browser predecessor. An explicit empty `POST /api/auth/reset` SHALL return 204 with no-store and three separate hardened expiry headers for the WBS access, correlation and organization-selection cookies. Reset SHALL clear only these cookies without issuing credentials or mutating server authority; it SHALL remain distinct from durable logout.

#### Scenario: Stale cookies can be removed without proving identity

- **GIVEN** a browser with an invalid old access credential and correlation
- **WHEN** it explicitly posts to the reset endpoint with the exact application Origin
- **THEN** all three WBS session cookies are expired independently and the response is 204
- **AND** no server session is revoked or created and no provider is contacted
- **AND** the next password attempt from the cleared cookie jar reaches ordinary password validation

#### Scenario: Broken or absent browser cookies remain clearable

- **WHEN** the exact-origin reset contains absent, expired, malformed, duplicated or mismatched access/correlation cookies
- **THEN** it still expires the same three fixed cookie names
- **AND** it never interprets unverified cookie contents as identity or clears unrelated preferences

#### Scenario: Reset does not silently log out a server session

- **GIVEN** an existing live credential and lifecycle recorded before reset
- **WHEN** a same-origin browser explicitly resets its local cookies
- **THEN** those server records remain unchanged
- **AND** the response makes no durable logout acknowledgement

### Requirement: Reset admission protects browser cookies

The reset endpoint SHALL reject absent or foreign Origin with 403 before setting cookies. It SHALL reject Authorization and retired `x-wbs-token` carriers, non-empty request bodies, and query parameters without setting cookies. Only POST SHALL reset cookies. Reset SHALL be independent of credential verification and therefore SHALL NOT catch and downgrade authentication-store failures elsewhere.

#### Scenario: Cross-origin reset cannot clear sign-in cookies

- **WHEN** a request omits Origin or supplies a different Origin
- **THEN** reset answers 403 with no Set-Cookie and no server mutation

#### Scenario: API carriers and malformed requests cannot reset a browser

- **WHEN** a reset request carries Authorization, `x-wbs-token`, a body, a query, or an unsupported method
- **THEN** it is refused without Set-Cookie or server mutation

### Requirement: SSO recovery requires a proved login transaction

The OIDC callback SHALL require a consumed transaction matching state and browser binding before redirecting an unverified predecessor to `/?auth_error=browser_session_unverified`. It SHALL clear only settled transaction bindings, without provider exchange, account resolution, replacement or revocation. Invalid callbacks SHALL retain existing refusals and preserve session cookies. Unexpected storage errors SHALL remain server failures.

#### Scenario: An honest callback returns to an actionable sign-in screen

- **GIVEN** a valid outstanding login transaction and its browser binding alongside an unverifiable old access cookie
- **WHEN** its matching callback arrives
- **THEN** it redirects to `/?auth_error=browser_session_unverified` without exchanging the code
- **AND** only that settled login binding is removed and no new session is issued

#### Scenario: A forged callback cannot consume an honest transaction for recovery

- **GIVEN** an honest outstanding login and an invalid old access cookie
- **WHEN** a callback supplies mismatched state, absent binding or duplicate parameters
- **THEN** it remains refused without a recovery redirect or session-cookie clearing
- **AND** mismatched state does not consume the honest outstanding transaction

#### Scenario: Broken trusted state is not a stale-cookie recovery

- **GIVEN** a callback whose matched transaction is valid but whose predecessor-proof store throws
- **WHEN** the callback is processed
- **THEN** it fails as a server error without a recovery redirect, session clearing, provider exchange or credential issuance

### Requirement: Recovery reports its outcome and requires a fresh sign-in

The sign-in card SHALL explain the refused saved credential and offer explicit reset. It SHALL prevent duplicate reset submissions, report validated success or failure, and require a fresh sign-in after success. It SHALL retain distinct unrelated error messages and never render, store or log provider authorization codes or state.

#### Scenario: Successful reset lets the user choose a fresh login

- **GIVEN** the password refusal or the SSO recovery redirect
- **WHEN** the user chooses reset and the endpoint answers 204
- **THEN** the screen announces that saved sign-in cookies were cleared and asks the user to sign in again
- **AND** no login or signed-in callback runs automatically

#### Scenario: Failed reset remains actionable

- **WHEN** the reset request fails, is refused or returns a malformed response
- **THEN** the screen reports failure and retains the reset action for retry
- **AND** it never claims cookies were cleared or that the user signed in
