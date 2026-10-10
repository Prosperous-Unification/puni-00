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

### Requirement: Independent prospect identity for AI

When a prospect chooses AI, the PUNI API SHALL authenticate them through its own OIDC session and exact app Origin/CSRF controls, without accepting WBS cookies or audiences. It SHALL atomically attach a valid same-browser draft to the signed-in account once and SHALL present explicit lost, expired and cancelled-login recovery states. Manual submission SHALL remain available if sign-in is cancelled.

#### Scenario: Login consumes draft

- **WHEN** the browser returns from valid state/PKCE login with its unexpired draft claim
- **THEN** exactly one owner-scoped software request contains the original description and the app presents it as an unsent message

#### Scenario: Stolen, stale or reused claim

- **WHEN** the claim is missing, expired, consumed or bound to a different browser
- **THEN** no other account gains its text and the app offers a new-description path without exposing prior content

#### Scenario: Cross-origin credential refusal

- **WHEN** a WBS cookie, wrong OAuth audience, unapproved CORS Origin or absent CSRF proof reaches a PUNI write
- **THEN** the API refuses the write without mutating request state

#### Scenario: Cancelled login

- **WHEN** the visitor cancels login before the 24-hour claim expires
- **THEN** the browser-bound draft remains resumable for manual submission or sign-in retry within its lifetime and no account-owned request is created

### Requirement: Durable continuation

The app SHALL reload a browser-claim-scoped manual description and brief before submission or an account-owned description, brief and conversation after sign-in, with a visible unavailable state when the permitted read fails.

#### Scenario: Reload after intake or conversation

- **WHEN** a visitor reloads the manual page before submission or an account owner reloads after a chat turn
- **THEN** the content allowed by that visitor's claim or account reappears without retyping
