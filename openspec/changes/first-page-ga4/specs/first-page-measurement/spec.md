## ADDED Requirements

### Requirement: First registered page measurement before cookie permission

Enabled measurement SHALL load the Google tag and enqueue the initial canonical page_view on the first registered public page before any cookie-permission interaction. The initial commands SHALL set analytics_storage, ad_storage, ad_user_data and ad_personalization to denied unless valid existing analytics permission grants analytics_storage. Normal builds/demo and unregistered/operator routes SHALL remain unmeasured. The exact development/production origin and measurement-ID isolation SHALL remain enforced.

#### Scenario: Fresh landing without a stored choice

- **WHEN** a visitor opens Home with explicit development enablement and no preference
- **THEN** the controlled real Google tag receives a canonical Home page_view before any click, with analytics storage denied and no analytics cookies or receipt markers written

#### Scenario: Startup interaction and navigation

- **WHEN** a safe funnel step or registered client navigation occurs during tag startup
- **THEN** the initial Home view and eligible safe events are enqueued in order without blocking the functional action or substituting a later page for Home

### Requirement: Preserve explicit measurement rejection and withdrawal

A valid stored rejection SHALL continue to block Google loading and measurement. An explicit rejection or withdrawal SHALL stop future measurement, cancel stale initialization, clear configured analytics cookies/markers and leave functional request storage intact. Missing/expired/malformed permission SHALL NOT grant analytics cookies. The existing consent lifetime/environment boundary SHALL remain enforced.

#### Scenario: Reject during loading and return later

- **WHEN** a visitor rejects while the tag is loading or returns with a valid rejected preference
- **THEN** no stale loader or queued event re-enables measurement, no future payload is sent after rejection, and the functional intake remains available

### Requirement: Grant cookies without replaying history

Accepting analytics SHALL update the existing Google consent state before subsequent measurement and allow only analytics storage, while advertising and user-provided-data features remain disabled. It SHALL NOT re-send already queued cookieless events or replay past questions, briefs or leads merely because consent changed. Cookieless lead deduplication SHALL use no persistent analytics marker; consented deduplication SHALL retain its existing valid-marker boundary.

#### Scenario: Consent after first page view

- **WHEN** cookie permission is granted after an initial cookieless Home view
- **THEN** the Google consent update precedes future cookie-enabled events, Home is not duplicated solely by the grant, and no historical conversion is invented

### Requirement: Restrict payloads and optional transport failure

All event payloads SHALL use the existing validated event/page/campaign allowlists and scrubbed context before any vendor command. Raw descriptions, answers, briefs, references, emails, claims, receipts and arbitrary query/hash/title data SHALL NOT be sent. Loading, buffering if needed, retries and cleanup SHALL be bounded and modeled; optional vendor failure SHALL NOT block the request. No detailed pre-consent recorder or retrospectively consented activity profile belongs to this change.

#### Scenario: Sensitive sentinels and unavailable vendor

- **WHEN** input URLs, fields or browser context contain sensitive sentinels, or the Google load fails/stalls
- **THEN** actual collector payloads contain none of those values, retries stop at the documented bound, and functional request actions still complete independently

### Requirement: Truthful shared controls and reporting evidence

Site/app controls and privacy notice SHALL distinguish default cookieless measurement, optional analytics cookies and complete measurement opt-out. They SHALL accurately show loading, cookieless, permitted, rejected and unavailable states. Verification SHALL separate a vendor enqueue, actual network payload, Google endpoint acknowledgement and processed GA4 reports. It SHALL NOT claim complete refused-visitor funnels, low-volume modeling eligibility or verified GA account settings without evidence.

#### Scenario: Inspect consent choices and GA results

- **WHEN** a visitor inspects privacy controls before and after granting/rejecting
- **THEN** controls describe the actual collection/storage state, and the release record states exactly which collection and reporting checks were observed or remain unavailable
