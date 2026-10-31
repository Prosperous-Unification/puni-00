## ADDED Requirements

### Requirement: Quiet shared app masthead

The app SHALL match the approved landing masthead: left PUNI/moon identity, plain horizontal Home/Build/Services/Blog links at the right on desktop, accessible Menu at narrow widths, and calm associated controls. Night and light routes SHALL retain legible tones, keyboard focus, skip navigation, at least44px targets and bounded moon fallback. The obsolete expanded navigation rail SHALL be removed.

#### Scenario: Responsive app header

- **WHEN** chat, loading, paused, disabled, manual review and operator routes render at1440/768/390/320px
- **THEN** header geometry and link typography match the landing reference, labels are unnumbered, no content overlaps, and the moon/dot identity and Menu Escape/focus restoration work

### Requirement: Conversation before contact commitment

Visitors SHALL start and answer the scoping questionnaire, send typed context or suggested answers, inspect and edit their brief, and continue the available conversation without supplying an email or account. Email SHALL be requested only during explicit request review/submission. A visitor SHALL retain the ability to request human review early or decline contact. The app SHALL show the true disabled/paused provider state and SHALL NOT simulate a live AI reply.

#### Scenario: Email-free scoping and correction

- **WHEN** a visitor starts from Improve, answers a suggestion, adds a correction and reviews the candidate brief
- **THEN** no email is required or submitted, selected and raw answers remain authoritative, and an editable summary is available before the explicit contact step

#### Scenario: Human review and email refusal

- **WHEN** a visitor chooses early human review or declines the email invitation
- **THEN** the existing review or continued conversation remains available without an automatic submission or renewed pressure for contact

### Requirement: Guide requests toward existing offers

The assistant SHALL scope requests using the five existing starting offers and the server-owned question/answer catalogue. It SHALL choose one relevant catalogue question at a time, account for supplied answers and references, use route-selection when useful, and present suggestions for the visitor to confirm.

#### Scenario: Uncertainty resolves to a supported direction

- **WHEN** a visitor starts unsure and describes a problem fitting an available offer
- **THEN** the assistant offers a relevant catalogue question or grounded brief, its suggested answers use reviewed labels, and any proposed direction remains a visitor choice

#### Scenario: Supplied details and unsupported assumptions

- **WHEN** a detailed opening already supplies the purpose, users and workflow or corrects an earlier assumption
- **THEN** the assistant skips redundant questions, uses those facts to narrow the request and preserves open questions without inventing technology or service commitments

### Requirement: Preserve guided offer boundaries

The assistant SHALL NOT invent offers, silently change visitor intent, require every question, request credentials, promise acceptance, or quote prices or timelines. Reply schema version1 and historical recorded operations SHALL remain compatible.

#### Scenario: Supported scope and historical replies

- **WHEN** future scoping replies recommend an offer or a historical operation is replayed
- **THEN** recommendations respect the existing offer boundaries and recorded operations retain their recorded meaning without a new provider call

### Requirement: Bounded truthful development activation

Implementation SHALL preserve existing claims, CSRF, revisions, replay, idempotency, raw text and spending/turn limits. Changed future prompt instructions SHALL use a new prompt identity while historical operations retain their recorded meaning. Development activation SHALL pass the existing source, provider, pricing and bounded paid-evaluation gates; source fixtures SHALL NOT be represented as live paid-model acceptance. Production SHALL remain held.

#### Scenario: Prepare source before inference activation

- **WHEN** header and guided-prompt checks pass locally
- **THEN** source can be reviewed independently, while live AI remains unverified until the exact gated development activation and real-provider checks succeed
