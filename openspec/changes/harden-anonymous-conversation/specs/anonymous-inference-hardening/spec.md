## ADDED Requirements

### Requirement: Preserve the visitor journey

The website SHALL retain anonymous entry, its current guided-scoping interactions, eight completed visitor exchanges, Send, Stop, Retry, Start over and manual proposal submission. Hardening SHALL use existing busy, limit and pause states without sign-in, email verification, fingerprinting or a new visible challenge.

#### Scenario: Ordinary visitor

- **WHEN** a visitor enters, completes a conversation, starts over or submits a manual proposal within the allowances
- **THEN** the existing journey remains usable without an added interaction

### Requirement: Bound all paid attempts

The server SHALL admit at most ten paid attempts per conversation, including stops, errors, invalid replies and retries. Completed replays and refused admissions SHALL consume no new attempt. The limit SHALL be checked transactionally before contacting the provider and SHALL survive restarts and concurrent processes.

#### Scenario: Repeated stopped replies

- **WHEN** ten paid attempts have been admitted and interrupted in one conversation
- **THEN** an eleventh is refused without another provider call even when no visitor turn was completed

### Requirement: Persist browser and rolling source allowances

The server SHALL bind each draft to a server-issued browser claim and retain its usage across Start over. Browser and source allowances SHALL independently permit at most three conversations and USD0.30 of reserved or settled usage over the preceding 24 hours, with IPv6 sources grouped by /64. Current and previous daily source identities SHALL both count across midnight. Missing browser cookies SHALL NOT detach an existing draft from its original allowance.

#### Scenario: Cookie retained while source changes

- **WHEN** a browser starts three paid conversations from different sources within 24 hours
- **THEN** its fourth paid conversation is refused

#### Scenario: Cookies cleared or midnight crossed

- **WHEN** one source has spent its allowance and creates a new draft with a new browser claim before 24 hours have elapsed, including across UTC midnight
- **THEN** the source allowance still refuses paid admission

### Requirement: Bound new-conversation bursts durably

The server SHALL allow at most one new paid conversation per browser or source per rolling minute and twenty per site per rolling minute. The counters SHALL survive restart and two connections SHALL NOT both claim the final allowance. Existing conversations and manual proposals SHALL remain usable when only a new-conversation window is full.

#### Scenario: Concurrent fresh conversations

- **WHEN** two fresh drafts from the same source race for its one-minute allowance
- **THEN** exactly one reaches the provider and the other receives the existing temporary rate-limit state

### Requirement: Preserve financial accounting across retention

The server SHALL reserve against site ceilings of USD2 per rolling hour, USD10 per UTC day and USD100 per UTC month before each call. It SHALL preserve the existing USD8 automatic pause and concurrency bound. Financial accounting SHALL survive draft discard, content erasure, cleanup, restart and code rollback; interrupted attempts SHALL retain their full reservation.

#### Scenario: Old drafts removed

- **WHEN** retained draft content is purged after its paid operations were charged
- **THEN** its spend still counts against the applicable site and rolling source/browser ceilings

### Requirement: Authenticate the forwarded source boundary

When forwarded source identity is configured, the API SHALL accept it only from explicitly trusted socket peers and SHALL refuse missing, malformed or untrusted peer identity before reading protected state or calling the provider. Deployment SHALL isolate the API from public ingress and configure the actual gateway peers; forwarders SHALL overwrite untrusted source headers.

#### Scenario: Direct client chooses a forwarded address

- **WHEN** an untrusted socket peer supplies an otherwise valid forwarded source
- **THEN** the API refuses the request and grants no allowance

### Requirement: Preview testing reset

A configured high-entropy operator secret in a URL fragment SHALL reset only the requesting browser's test allowance through an origin-checked, secret-authenticated POST. Production origins SHALL refuse this configuration. The same controls and screens SHALL remain in use.

#### Scenario: Authorized preview reset

- **WHEN** the operator opens the preview reset fragment after exhausting a conversation
- **THEN** its allowance is replenished, the fragment disappears, history remains and normal chat loads

#### Scenario: Development hostname compatibility

- **WHEN** a tester uses the exact development request hostname or its legacy development app hostname with the development site API
- **THEN** the secret reset remains available, while production, crossed origin pairs and lookalike suffixes remain refused

#### Scenario: Unauthorized or production reset

- **WHEN** the secret is absent, wrong, disabled or used against production
- **THEN** no allowance is reset and no billing record is removed

### Requirement: Keep testing credentials out of navigation telemetry

The frontend SHALL remove a testing reset fragment before analytics or page initialization and SHALL send the secret only in the authenticated POST header, never in an HTTP URL or rendered failure. Ordinary startup SHALL make no reset request.

#### Scenario: Reset startup

- **WHEN** an operator opens a valid reset fragment
- **THEN** the address bar is scrubbed before the reset callback or analytics runs

### Requirement: Preserve financial controls during testing

The reset SHALL retain conversation history and financial records and SHALL NOT bypass site spending, global fresh-conversation capacity, pause or concurrency controls. The claimed conversation’s active attempt SHALL be fenced and cancelled before its allowance is renewed.

#### Scenario: Reset at the site ceiling

- **WHEN** a tester resets their allowance while the site ceiling or pause is active
- **THEN** history and charged reservations remain and new paid inference is still refused
