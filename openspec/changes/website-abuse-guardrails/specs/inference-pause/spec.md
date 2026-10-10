## ADDED Requirements

### Requirement: Spend threshold opens a durable pause

Inside the admission transaction of the anonymous conversation and of the account reservation, when the site's UTC-day spend plus the new reservation reaches 80% of the site-day ceiling and no pause is open, the store SHALL insert an `inference_pause` row with reason `site_spend`, refuse the operation, and the API SHALL raise the `inference_paused` alert. At most one pause SHALL be open at a time (partial unique index). The pause SHALL NOT clear at UTC midnight or on restart.

#### Scenario: Reaching 80%

- **WHEN** today's settled and reserved spend is $7.99 and a reservation of $0.02 is attempted
- **THEN** the reservation is refused, an open pause with reason `site_spend` exists, the provider is not called, and an `inference_paused` alert row exists

#### Scenario: Survives midnight and restart

- **WHEN** a pause opened yesterday and the API restarts today
- **THEN** `GET /conversation` reports `provider: 'paused'` and a stream request is refused

### Requirement: Visible paused state

While a pause is open, `GET /conversation` SHALL report `provider: 'paused'` and `challenge: null`; `POST /conversation/stream`, `/chat/stream` and `/chat` SHALL answer 503 `provider_paused` without admitting an operation, while replays of completed operations still answer. Reads, the brief, proposal requests and the manual path SHALL keep working. Build SHALL render `paused` as its own state with the manual path.

#### Scenario: Paused visitor

- **WHEN** a visitor with a live draft reads the conversation during a pause
- **THEN** Build shows the paused row and `Shape your brief →`, no composer, and the inline proposal card still submits

#### Scenario: Replay during a pause

- **WHEN** a completed operation's key is posted again during a pause
- **THEN** the saved reply streams back and the provider is not called

### Requirement: Operator pause, resume and overview

`POST /operator/inference/pause` and `POST /operator/inference/resume` SHALL require an operator session and the CSRF header, SHALL write `paused_by`/`resumed_by = 'operator'`, and SHALL answer 409 when the state is already as requested. `GET /operator/guardrails` SHALL return the open pause, today's site spend and ceiling in micro-USD, today's `draft:site` and `proposal:site` counts, the account lock, the number of open source locks and the last 50 alerts with their delivery outcome. The operator page SHALL show these and a pause/resume control with an inline confirmation.

#### Scenario: Operator resumes

- **WHEN** an operator posts resume during an open `site_spend` pause
- **THEN** the row records `resumed_at` and `resumed_by`, the next conversation read reports `openrouter`, and a stream request is admitted

#### Scenario: Resume without a pause

- **WHEN** no pause is open and resume is posted
- **THEN** the API answers 409 and writes nothing

#### Scenario: Unauthenticated control

- **WHEN** pause is posted without an operator session or without CSRF
- **THEN** the API answers 401 or 403 and no pause opens
