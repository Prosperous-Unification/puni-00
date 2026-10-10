## ADDED Requirements

### Requirement: Separately deployable public funnel

The operator SHALL be able to deploy the private static site from `puni-pr-00/apps/website/site` and PUNI API/app separately from WBS, using pinned revisions and Nx targets, with valid TLS and exact host routing for `puni.dev`, `app.puni.dev` and `api.puni.dev`. The manual funnel MUST work without prospect IdP or paid inference, while the operator inbox requires staff authentication. An API release SHALL preserve data across additive migrations and rollback to the previously applied migration set; a failed rollback MUST report the manual completion command. Health, smoke and restore checks MUST prove the serving version and durable request content.

#### Scenario: Independent release

- **WHEN** a PUNI site or API candidate passes its health and smoke checks
- **THEN** its host serves the candidate without changing WBS routes or data

#### Scenario: Abort after migration

- **WHEN** a swap fails after additive migrations were applied
- **THEN** rollback returns to the recorded applied set or loudly reports the exact manual completion command

#### Scenario: Backup restore

- **WHEN** a backup is restored into a fresh instance
- **THEN** stored requests, briefs and submission states pass integrity checks and accept a new write

### Requirement: Privacy lifecycle and aggregate observation

The system SHALL apply the approved 12-month retention period to request descriptions, chat and one contact email unless the person becomes a client, expire anonymous drafts after 24 hours, and restrict deletion/backup handling by a documented operator policy. Funnel observation SHALL be derived from stored rows as per-UTC-day counts on the operator overview; no analytics script or event beacon SHALL run in the browser. The site's privacy page SHALL name the routing processor and the model host before chat is enabled, SHALL describe the salted daily address code, and SHALL name no sign-in provider while none exists.

#### Scenario: Retention and transition

- **WHEN** an abandoned request reaches its retention deadline or becomes a client
- **THEN** the documented retention/deletion or client-record policy applies with an auditable transition

#### Scenario: Log and event inspection

- **WHEN** a description containing a distinctive marker flows through intake, chat and submission
- **THEN** no access log or analytics event contains that marker or a cookie value

#### Scenario: Missing provider wording

- **WHEN** provider-as-processor wording has not been approved
- **THEN** paid chat is disabled while the manual funnel remains available
