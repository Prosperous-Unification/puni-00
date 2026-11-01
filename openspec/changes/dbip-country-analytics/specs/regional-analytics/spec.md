## ADDED Requirements

### Requirement: Verified local country database

The API SHALL use the supplied November 2026 DB-IP Lite database for local IPv4 and IPv6 lookups. The compressed archive and extracted database SHALL match recorded SHA-256 identities. Missing, unreadable, corrupt, mismatched or wrong-kind configured database assets SHALL refuse startup with a nonsecret error. Expected unmapped addresses and unrecognized country estimates SHALL produce an explicit unknown result. No lookup SHALL send an address to DB-IP, MaxMind or another country service.

#### Scenario: Real supplied dataset

- **WHEN** the verified dataset receives 8.8.8.8, 80.158.1.1 and 2a00:1450:4001:800::200e
- **THEN** it resolves US, DE and DE respectively using the local reader
- **AND** loopback/unmapped addresses yield unknown without an external request

#### Scenario: Broken installed asset

- **WHEN** a configured archive is absent, unreadable, corrupt, changed or not a country database
- **THEN** startup refuses rather than granting a regional default or silently omitting the feature

### Requirement: Trusted regional decision endpoint

GET /analytics/region SHALL derive its address through the existing trusted-proxy selection and general request-window rules. It SHALL ignore caller-supplied country hints. Its no-store JSON SHALL expose only a regional category and nonsecret dataset maintenance metadata, never the address, address hash, request identity or precise location. It SHALL retain current CORS/origin rules for configured surfaces; ordinary same-origin GET without Origin remains usable. The lookup SHALL add no persistent address or country records.

#### Scenario: Forwarded address and forged hint

- **WHEN** the trusted forwarded address is German and a request supplies a conflicting country hint or untrusted forwarded prefix
- **THEN** the decision remains consent-required from the trusted selected address

#### Scenario: Missing hop or foreign origin

- **WHEN** a required trusted address is missing or a request has a foreign Origin
- **THEN** the existing typed source refusal or a 403 origin refusal is returned, with no invented country

### Requirement: Regional defaults preserve explicit choice

The configured consent region SHALL include EU/EEA members, the UK and Switzerland, including the corresponding EU outermost country codes. Fresh visits there and unknown/pending/failed lookups SHALL deny analytics storage and show the compact arrival card. A known other country SHALL hide the arrival card and allow the regional analytics-cookie default without writing a false accepted preference. A valid saved acceptance or rejection SHALL take precedence everywhere; unreadable preference state SHALL never acquire an automatic grant. Privacy choices SHALL remain available.

#### Scenario: Geographic defaults

- **WHEN** a fresh supported visit resolves DE, GB, CH, IS, LI or NO
- **THEN** cookies remain denied and the card appears
- **WHEN** it resolves US or UA
- **THEN** the card stays hidden and the regional cookie default applies without a consent-preference cookie

#### Scenario: Pending or failed decision

- **WHEN** regional lookup is delayed, fails, is malformed or is unknown
- **THEN** no analytics-cookie permission is inferred
- **AND** request interaction remains usable without waiting for the lookup

#### Scenario: Saved and racing choices

- **WHEN** a visitor has rejected measurement or rejects while a lookup is in flight
- **THEN** a later other-country response cannot restart Google or grant storage
- **WHEN** valid saved acceptance exists
- **THEN** its explicit permission is honored independently of regional lookup

### Requirement: Bounded country resolution and no replay

The browser SHALL resolve the region only for configured supported routes that need the regional default. Resolution SHALL have a bounded three-second deadline, no implicit retry, and disposal/race fencing. Operator, disabled and saved-rejection routes SHALL not perform an unnecessary lookup. Region changes SHALL not replay page observations, questions, briefs or leads. Existing measurement isolation, bounded queues, sanitization, withdrawal and cookie cleanup SHALL remain effective.

#### Scenario: Failure and disposal

- **WHEN** the response fails, times out, arrives after disposal or conflicts with a newer explicit choice
- **THEN** it cannot create a late cookie grant or cause a repeated lookup/event

#### Scenario: Initial page context

- **WHEN** the visitor navigates while region and vendor startup are pending
- **THEN** existing bounded initial-page ordering and current context survive without a detailed activity recorder or consent backfill

### Requirement: Compact accessible card on both surfaces

The site and anonymous app SHALL use a compact bottom-left card in consent-required/unknown cases without changing masthead or hero composition, stealing focus or requiring a decision to use the questionnaire. Equal primary actions SHALL retain at least 44px targets, legible contrast and truthful failure messages. The original healthy site first-screen input guarantee at 320x568 and 390x667 SHALL remain. The app SHALL retain request access on short-phone viewports through its established scroll owner.

#### Scenario: Healthy and failure phone layouts

- **WHEN** healthy arrival appears at the original supported phone sizes
- **THEN** the complete site input/send remain initially visible and hit-testable
- **AND** app questions, suggested answers, input and footer remain usable without choosing
- **WHEN** storage fails or the viewport is shorter
- **THEN** truthful failure and request controls remain reachable through ordinary scrolling

### Requirement: DB-IP attribution and provenance

Every site/app page that uses the country decision SHALL include an accessible visible link to https://db-ip.com with credit identifying DB-IP. Source/artifact notices SHALL identify DB-IP Lite, its source URL, November 2026 release and CC BY 4.0 licence, link the licence, and state that the dataset is unchanged. Privacy copy SHALL describe server-local approximate country lookup without claiming a third-party per-visitor lookup or precise/legal location.

#### Scenario: Supported page attribution

- **WHEN** an anonymous app route, site page or privacy page uses the regional decision
- **THEN** its shared footer contains the DB-IP credit link
- **AND** the bundled dataset retains its source/licence notice

### Requirement: Monthly download reminder

An indexed website maintenance note SHALL prominently state that the next DB-IP Lite download is due 1 December 2026, link the official download page and describe verifying/replacing the archive, updating provenance and checking the build. Nonsecret runtime metadata SHALL expose the release month, next refresh date and whether that date has arrived. No automatic download or external notification SHALL be implied.

#### Scenario: Due date

- **WHEN** the November dataset is inspected before 1 December
- **THEN** metadata reports refresh not yet due
- **WHEN** the date reaches 1 December
- **THEN** metadata reports the refresh is due and the maintenance note gives the download action

### Requirement: Packaged server data

The actual API build SHALL carry its verified database and notice into the runtime package. The browser bundles SHALL not receive the database. A compiled runtime smoke SHALL exercise known-country decisions and fail loudly if its required database asset is removed. Private snapshots SHALL preserve canonical public runtime trees and include the new dependency and attribution. Production and inference activation remain held.

#### Scenario: Real bundle asset dependency

- **WHEN** the compiled API runs with its emitted database asset
- **THEN** a known-country request returns the expected category
- **WHEN** that actual asset is removed
- **THEN** the runtime smoke observes startup refusal
