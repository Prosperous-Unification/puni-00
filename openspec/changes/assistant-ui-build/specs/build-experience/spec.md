## ADDED Requirements

### Requirement: Owned request entry

The API SHALL expose a non-cacheable request availability response only to the exact configured site and app origins, without disclosing prompt text or tokens. Build SHALL open the fixed app URL only for an owned request. Missing or expired requests SHALL return the visitor to the Home prompt with focus and visible feedback. Network/API failure SHALL render a retryable error rather than imply an absent request.

#### Scenario: Fresh visitor

- **WHEN** a visitor without a request selects Build or visits the app directly
- **THEN** Home highlights and focuses the request composer

#### Scenario: Request owner

- **WHEN** the API confirms a browser-owned draft or account-owned request
- **THEN** Build opens the configured app and loads that request

#### Scenario: Foreign origin

- **WHEN** an unconfigured origin requests entry status
- **THEN** the API refuses access

### Requirement: Google sign-in

The app SHALL offer Google sign-in, preserve the request through OIDC, and require authentication before paid inference. OIDC SHALL retain state, nonce, PKCE, issuer/audience and verified-email checks. Preview SHALL support the exact configured callback under /api. Missing credentials SHALL produce an honest unavailable state with manual continuation.

#### Scenario: Sign-in round trip

- **WHEN** a visitor signs in after Home submission
- **THEN** their request is attached to their account and Build resumes it

### Requirement: Customer conversation

The Build app SHALL use assistant-ui and stream server-authorized replies through AI SDK. It SHALL show saved conversation, send/pending/error states, remaining allowance, and working cancellation and retry. After sign-in, Build SHALL show the saved Home request and wait for the customer to press Send before making its initial inference request. That deliberate action SHALL make the Home request the first user turn exactly once. A stable server-owned operation identity SHALL prevent duplicate provider calls on retry, reload or simultaneous submission. Unknown usage SHALL retain its reservation and prevent further paid admission until reconciled.

#### Scenario: Opening request waits for Send

- **WHEN** Build mounts or reloads with a saved Home request whose initial operation has not started
- **THEN** the request remains visible and no stream request is sent until the customer presses Send
- **WHEN** the customer presses Send
- **THEN** Build sends one initial operation using the server-owned identity and shows the saved request as the first conversation turn
- **WHEN** the initial request fails before reaching the API and Build reloads
- **THEN** the saved request remains the only available first turn, and Retry resends that operation with the same identity

#### Scenario: Retry or reload

- **WHEN** the same turn is retried or the page reloads after a completed turn
- **THEN** the stored conversation resumes without a duplicate paid call

#### Scenario: Interrupted generation

- **WHEN** the user stops a reply or the provider stream fails
- **THEN** the request is cancelled, its outcome is recorded and unconfirmed usage remains reserved

### Requirement: Brief, preview and conversion

The app SHALL show the request brief and constrained concept preview beside chat on desktop and in accessible selectable panels on mobile. A customer SHALL be able to request human follow-up without exhausting AI allowance. Unconfigured providers SHALL never produce responses labeled as live AI.

#### Scenario: Human follow-up

- **WHEN** the customer selects Discuss this project with PUNI
- **THEN** the existing explicit proposal flow opens with the saved request
