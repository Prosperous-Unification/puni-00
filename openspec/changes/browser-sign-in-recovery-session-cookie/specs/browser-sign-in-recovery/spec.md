## ADDED Requirements

### Requirement: An expired access cookie is not an unverifiable predecessor

Password and SSO sign-in SHALL accept a browser that presents the correlation cookie without an access cookie as a proved OIDC predecessor while that correlation's browser lifecycle is active, and SHALL close that lifecycle and revoke its local refresh material before publishing the replacement session. A correlation whose lifecycle is absent, closed or revoked SHALL remain refused. Malformed, duplicated, mixed, native-with-correlation and unassociated carriers SHALL keep their existing refusals. The SSO recovery redirect SHALL log at info level which refusal check fired, without cookie or token values.

#### Scenario: A browser whose access cookie expired signs in again without reset

- **GIVEN** an active browser lifecycle and a browser that sends only its correlation cookie
- **WHEN** a matching SSO callback arrives
- **THEN** it redirects to `/` with new session cookies instead of `/?auth_error=browser_session_unverified`
- **AND** the old lifecycle is closed, its current credential revoked and its refresh token revoked at the provider

#### Scenario: A closed or unknown correlation still requires recovery

- **GIVEN** a browser that sends only a correlation cookie whose lifecycle is closed or does not exist
- **WHEN** a matching SSO callback arrives
- **THEN** it redirects to `/?auth_error=browser_session_unverified` without exchanging the code or changing server state
- **AND** an info-level log entry names the `inactive_session` refusal and contains no cookie value
