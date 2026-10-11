## ADDED Requirements

### Requirement: Anonymous description claim

The API SHALL accept a bounded description from an exact allowed public Origin, store a 24-hour intake draft, bind an opaque claim to a host-only secure HttpOnly cookie, and redirect only to the fixed app manual route. The request URL, redirects and logs MUST exclude raw descriptions and claim values.

#### Scenario: Valid handoff

- **WHEN** an anonymous browser posts a valid description from `https://puni.dev`
- **THEN** the API persists one draft, sets the claim cookie and redirects to the fixed app manual route without putting the description in the URL

#### Scenario: Forged origin or oversized body

- **WHEN** a request has an unapproved Origin or body beyond the configured bound
- **THEN** the API refuses it before creating a draft or setting a claim cookie

### Requirement: Browser-bound manual continuation

The API SHALL permit only the same browser's unexpired claim to resume its description and edit its manual request brief from the exact app Origin. Anonymous writes MUST pass CSRF/Origin and rate admission. Submission SHALL consume the claim; an email address or receipt MUST not grant public read access.

#### Scenario: Manual resume and submit

- **WHEN** the original browser loads `app.puni.dev/manual` before claim expiry
- **THEN** it receives its description and brief without prospect sign-in and can submit after entering one contact email

#### Scenario: Foreign browser or email lookup

- **WHEN** another browser or a caller knowing only the contact email requests the description
- **THEN** the API discloses no request content

#### Scenario: Forged manual write

- **WHEN** a caller lacks the browser claim, CSRF proof, exact app Origin or rate capacity
- **THEN** the API refuses brief edits and submission without changing stored state

### Requirement: Claim-bound identity for AI

When a visitor chooses AI, the PUNI API SHALL authorize the conversation by the same host-only browser draft claim and draft CSRF header that govern the manual brief, from the exact app Origin, without accepting WBS cookies or audiences. No prospect account, session or sign-in SHALL exist on the funnel; a configured `OIDC_*` setting SHALL stop the API at startup. Manual submission SHALL remain available at every conversation state. The manual brief SHALL link to Build while the draft claim is live and AI is enabled, and SHALL NOT link to Build otherwise.

#### Scenario: Stolen, stale or reused claim

- **WHEN** the claim is missing, expired, consumed or bound to a different browser
- **THEN** no other browser gains its text and the app offers a new-description path without exposing prior content

#### Scenario: Cross-origin credential refusal

- **WHEN** a WBS cookie, wrong OAuth audience, unapproved CORS Origin or absent CSRF proof reaches a PUNI write
- **THEN** the API refuses the write without mutating request state

#### Scenario: Manual brief route to Build

- **WHEN** the manual brief loads a live draft claim while the conversation provider is disabled or paused
- **THEN** it shows no link to Build, and with the provider enabled it shows one

#### Scenario: Retired sign-in routes

- **WHEN** a request reaches `/session`, `/session/oidc/*`, `/session/demo`, `/chat*` or `/concept*`
- **THEN** the API answers 404 and no row changes

### Requirement: Durable continuation

The app SHALL reload a browser-claim-scoped description, brief and conversation before submission, with a visible unavailable state when the permitted read fails.

#### Scenario: Reload after intake or conversation

- **WHEN** a visitor reloads the manual page before submission or after a conversation turn
- **THEN** the content allowed by that visitor's claim reappears without retyping
