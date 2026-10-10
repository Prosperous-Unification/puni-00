## ADDED Requirements

### Requirement: One conversation design

The funnel SHALL expose exactly one conversation API, `/conversation*`, authorized by the draft claim. The API SHALL answer 404 for the retired routes and SHALL refuse to start with any `OIDC_*` setting.

#### Scenario: Retired routes answer 404

- **WHEN** a request from the exact app Origin, with a live draft claim and its CSRF header, reaches `GET /session`, `DELETE /session`, `GET /session/oidc/start`, `GET /session/oidc/callback`, `GET /api/session/oidc/callback`, `POST /session/demo`, `GET /chat`, `POST /chat`, `POST /chat/stream`, `POST /chat/cancel`, `POST /concept` or `POST /concept/revision`
- **THEN** the API answers `404` with `{ "code": "not_found" }`, sets no cookie, and no row in any table changes

#### Scenario: Startup refusal

- **WHEN** the API reads an environment containing `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` or any other `OIDC_*` name, even with an empty value
- **THEN** startup throws `prospect sign-in was retired on 2026-10-11 (ADR 0039); remove OIDC_<NAME>` naming every such setting

#### Scenario: Build without a sign-in control

- **WHEN** the Build route renders in the disabled, paused and live-harness states at 1440, 1024, 768, 390 and 320 px
- **THEN** no element's text contains `Sign in`, `Sign out`, `Google` or `Continue with`
