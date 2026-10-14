## ADDED Requirements

### Requirement: The session read reports deployment features

`GET /api/auth/me` SHALL answer `features: { onboarding: boolean, organizations: boolean }` beside `user`, for a signed-in and a signed-out caller alike. `onboarding` SHALL be true exactly when the onboarding routes would not refuse `onboarding_inactive` for being before activation. `organizations` SHALL be true only when `onboarding` is true and the organization selection composition is mounted. A broken activation marker SHALL fail the read with 500, never report `false`. The field SHALL be optional in the shared contract so that clients and stubs that omit it remain valid.

#### Scenario: Local deployment before activation

- **GIVEN** a booted be-01 whose activation marker is `pre_activation`
- **WHEN** a caller with or without a session requests `GET /api/auth/me`
- **THEN** the answer is 200 with `features` `{ onboarding: false, organizations: false }`

#### Scenario: Activated deployment without organization selection

- **GIVEN** a booted be-01 with the browser session authority `disabled` and the marker `activated`
- **WHEN** a caller requests `GET /api/auth/me`
- **THEN** `features` is `{ onboarding: true, organizations: false }`

#### Scenario: Activated deployment with organization selection

- **GIVEN** a booted be-01 with the browser session authority `enabled` and the marker `activated`
- **WHEN** a caller requests `GET /api/auth/me`
- **THEN** `features` is `{ onboarding: true, organizations: true }`

#### Scenario: Broken activation marker

- **GIVEN** a booted be-01 whose `organization_activation` table holds no row
- **WHEN** a caller requests `GET /api/auth/me`
- **THEN** the answer is 500

### Requirement: The client does not read features reported off

fe-01 SHALL pass the session read's `features` to every signed-in surface. When `onboarding` is false the onboarding screen SHALL render the signed-in app without requesting `GET /api/onboarding`. When `organizations` is false the Organization page SHALL render its "not active" state without requesting any organization panel, and the Spaces page SHALL render its "Spaces need an organization" state without requesting or polling `GET /api/spaces`. While the legacy organization runtime starts with `organizations` false, the organization gate SHALL NOT mount membership choices or request `GET /api/organization/memberships`. When the session read carries no `features`, these surfaces SHALL issue their reads as before.

#### Scenario: Local mode page loads are quiet

- **GIVEN** the e2e stack in local mode
- **WHEN** the browser loads `/`, `/organization` and `/spaces`
- **THEN** no response has a 4xx or 5xx status and the console has no error or warning

#### Scenario: Older backend

- **GIVEN** a session read without `features`
- **WHEN** the onboarding screen and the Spaces page render
- **THEN** they request `GET /api/onboarding` and `GET /api/spaces` and render the refusals as states
