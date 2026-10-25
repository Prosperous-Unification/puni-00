## ADDED Requirements

### Requirement: Analytics is an independent visitor choice

The site and app SHALL block Google analytics scripts and measurement requests until explicit acceptance. Reject and change-preference controls SHALL be accessible. Refusal, withdrawal, tag blocking or analytics failure SHALL NOT prevent reading, chat, reference editing or submission. Events occurring without consent SHALL NOT be queued for later backfill.

#### Scenario: No consent or rejected consent

- **WHEN** a new visitor loads the site, rejects analytics and completes a request
- **THEN** no Google measurement script or request is sent, while the server records the request normally

#### Scenario: Withdrawal

- **WHEN** a consenting visitor withdraws consent in the app
- **THEN** new analytics dispatch stops, applicable analytics cookies are cleared, the preference persists across the site/app, and their request remains available

### Requirement: Events carry only approved metadata

All events SHALL pass a typed allowlist for event names and parameter values. Descriptions, messages, email, briefs, references, claim/CSRF tokens, internal request IDs, arbitrary URLs and free-text errors SHALL be excluded. Page locations, titles and referrers SHALL be sanitized before any tag initialization. Automatic form, search and outbound-link measurement SHALL be disabled for the initial release.

#### Scenario: Content leakage sentinel

- **WHEN** distinct sentinel strings appear in chat, email, references, query parameters, hash fragments and an API error
- **THEN** none appears in any intercepted analytics script URL, payload, page metadata or event

#### Scenario: Approved launch service pages

- **WHEN** a consenting visitor opens a service page with slug `launch-app-or-website`, `improve-app`, `build-something-similar`, `ai-assistant` or `automate-workflows`
- **THEN** its page event uses that fixed slug ID, canonical `/services/<slug>` path and reviewed offer title, excluding query strings and fragments
- **AND** historical registered service pages remain supported while unknown service slugs remain unmeasured and are rejected as event page IDs

### Requirement: Events reflect actual funnel milestones

The implementation SHALL emit the reviewed landing, starting-choice, conversation, question, brief, email-card and submission milestones only after their respective actions occur. `generate_lead` SHALL follow confirmed proposal persistence and SHALL NOT fire on button click, rejected submission, an email mention or duplicate receipt replay. It SHALL be configured as the initial GA4 key event.

#### Scenario: Successful request and replay

- **WHEN** one request is accepted and its confirmation is rerendered, reloaded or recovered after a lost response
- **THEN** the browser emits at most one `generate_lead` for that receipt, without disclosing the receipt or request identifier

#### Scenario: Failure is not a conversion

- **WHEN** the email is invalid, a submission fails, or the server refuses a cap
- **THEN** no lead event is emitted; a permitted bounded failure category can be emitted with consent

### Requirement: Site-to-app measurement preserves acquisition

Production site and app SHALL use the same GA4 stream and compatible measurement-cookie settings. The actual intake POST and redirect SHALL be tested for session continuity and absence of self-referrals. Development traffic SHALL NOT use the production stream. Functional claim cookies SHALL remain host-only and independent of analytics.

#### Scenario: Campaign visit reaches the app

- **WHEN** a consenting visitor follows a registered campaign URL, selects a starting choice and submits a request
- **THEN** the measured journey retains its original campaign through the real site/API/app navigation and produces one lead event

### Requirement: Reports state their scope

The release SHALL provide acquisition and funnel reports segmented by channel, starting choice and device, with consent/ad-blocking limitations documented. The operator's server records SHALL remain authoritative for total submitted requests and inference spend. GA4 lead counts SHALL NOT be labeled qualified requests or paid clients.

#### Scenario: Analytics and server totals differ

- **WHEN** one visitor accepts analytics and another declines, and both submit
- **THEN** the operator shows two submissions while GA4 can show only the consenting one; reports do not call the difference lost submissions

### Requirement: Privacy disclosure precedes analytics activation

The privacy notice SHALL name Google Analytics, its measurement purpose, optional storage and the available preference controls before tags are activated. The approved configuration SHALL record retention, advertising settings, environments and access owners.

#### Scenario: Missing disclosure or production configuration

- **WHEN** the release lacks a reviewed privacy notice, consent proof or approved production measurement ID
- **THEN** analytics stays visibly disabled in operator/deployment configuration and no production tag is installed
