## ADDED Requirements

### Requirement: Explicit prospect sign-out

The API SHALL expose `DELETE /session` to the exact app Origin, requiring the prospect session cookie and its CSRF header. It SHALL delete the session row, answer 204 with the session cookie expired (`Max-Age=0`, same attributes) and `Cache-Control: no-store`, and leave the draft claim, drafts and account data unchanged. A missing session SHALL answer 401; a missing or wrong CSRF header SHALL answer 403 without change. Build SHALL offer `[ Sign out ]` in place of `[ Sign in ]` while a session exists.

#### Scenario: Sign out

- **WHEN** a signed-in prospect posts `DELETE /session` with CSRF
- **THEN** the response is 204 with the expired cookie, `GET /session` then reports no account, and `GET /draft` with the draft claim still answers 200

#### Scenario: Forged sign-out

- **WHEN** `DELETE /session` arrives without the CSRF header or from a foreign Origin
- **THEN** the API answers 403 and the session still answers `GET /session`
