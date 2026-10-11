## ADDED Requirements

### Requirement: General request window over every route

The API SHALL count every request except `GET /health` against a general fixed one-minute window keyed by the hashed source, admitting at most 120 requests per source per minute and 3,000 requests per minute across all sources, before any store read and before the per-path windows. A request refused by any window SHALL count against no window. The refusal SHALL be 429 `rate_limited` with a `Retry-After` header holding the whole seconds until the window ends. A request whose client address cannot be determined SHALL be refused 400 `source_unavailable` and never attributed to a shared key.

#### Scenario: Windowless route is bounded

- **WHEN** one source has made 120 requests in the current minute, counting `GET /conversation`, `GET /entry` and `OPTIONS` preflights
- **THEN** its next `GET /conversation` answers 429 `rate_limited` with `Retry-After`, no store query runs for it, and another source's `GET /conversation` is admitted

#### Scenario: Global backstop

- **WHEN** 3,000 requests from distinct sources were admitted in the current minute
- **THEN** the 3,001st request from a new source answers 429 and the first source's request in the next minute is admitted

#### Scenario: Health is exempt

- **WHEN** the gateway's health probe calls `GET /health` without `X-Forwarded-For` while `TRUSTED_PROXY_HOPS=1`
- **THEN** it answers 200 and no window counts it

Retired 2026-10-11 by `retire-prospect-sign-in`; the routes no longer exist.

### Requirement: Per-path windows include the OIDC routes

The existing per-path windows (30 per source and 300 global per minute) SHALL also apply to `GET /session/oidc/start` and `GET /session/oidc/callback`, and every per-path 429 SHALL carry `Retry-After`. `createOidcLogin` SHALL delete expired `oidc_login` rows in the same transaction as its insert.

#### Scenario: OIDC start loop

- **WHEN** one source requests `/session/oidc/start` 31 times in a minute
- **THEN** the 31st answers 429 with `Retry-After` and no `oidc_login` row is written for it

#### Scenario: Expired logins are swept

- **WHEN** eleven minutes have passed since a login row was created and a new start is admitted
- **THEN** the old row is gone and exactly one live row remains

### Requirement: Minute windows live in memory, longer counts in rows

Minute windows SHALL be held in process memory and swept each minute; they SHALL NOT be written per request. Every count that spans more than a minute (daily caps, login lockouts, the inference pause, alert dedupe) SHALL be a SQLite row written inside the transaction that creates the counted thing, so blue and green agree.

#### Scenario: Restart loses at most one minute

- **WHEN** a source is refused by a minute window and the API process restarts on the same database
- **THEN** the source's next request in the new process is admitted while its daily caps and any lockout read from the database still apply
