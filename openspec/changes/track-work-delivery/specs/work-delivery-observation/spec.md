## ADDED Requirements

### Requirement: Provider-neutral delivery model

Delivery observations SHALL separate change requests, runs, attempts and executions using source-scoped opaque identities, revision identity, source provenance and observation timestamps. Vendor names, runner brands and native status enums MUST remain adapter details. Provider detection SHALL choose a supported adapter or return unsupported without contacting the supplied destination.

#### Scenario: Another provider uses the same model

- **WHEN** a synthetic non-GitHub provider emits opaque nonnumeric identifiers, non-SHA revisions and custom execution-resource labels
- **THEN** the shared observation schema and calculations accept it without GitHub-specific branches

#### Scenario: Unsupported or hostile URL

- **WHEN** a stored reference names an unsupported host, embedded credentials, a misleading hostname or a non-change path
- **THEN** detection returns unsupported and sends no HTTP request

### Requirement: Accurate timing and retry accounting

Measurements SHALL distinguish summed performed-execution duration, elapsed span and waiting basis. Missing timestamps SHALL remain unknown, incomplete inventories SHALL produce partial measurements, and carried executions SHALL NOT be counted as newly performed work. Current checks SHALL belong to the observed change revision.

#### Scenario: Partial rerun and parallel work

- **WHEN** an attempt reuses one successful execution and reruns a failed execution while other executions overlap
- **THEN** only performed executions contribute once to summed execution time, each attempt remains visible, and elapsed span is calculated separately

#### Scenario: Missing or contradictory timing

- **WHEN** enqueue timing is missing, a run remains active, inventory is truncated or timestamps contradict their ordering
- **THEN** unavailable measurements remain unknown, partial totals are labeled, and malformed timing cannot become a complete successful reading

### Requirement: Bounded read-only GitHub adapter

The initial adapter SHALL read public GitHub PR state, checks and attempt history with bounded, fixed-origin GET requests. It MUST refuse redirects and malformed identities and expose provider failures or incomplete scans. A revision race MUST prevent publishing checks for the wrong head. Check-run coverage MUST NOT imply complete merge-policy or commit-status coverage.

#### Scenario: Real change request

- **WHEN** the adapter reads a public puni-00 PR with completed CI
- **THEN** it reports attributed change state, current checks and observed timings, with merged commit only when the PR is merged

#### Scenario: Attempt history exceeds the request budget

- **WHEN** a PR's associated runs and attempts would need more GETs than the read's request budget
- **THEN** the adapter stops the attempt and job scan while the closing PR re-read still fits, returns the PR and its checks, and marks run and attempt inventories partial with a coverage note

#### Scenario: Provider faults and revision race

- **WHEN** reads encounter a redirect, invalid response, timeout, rate limit, missing record, exceeded scan budget or changed PR head
- **THEN** the adapter makes no unsafe redirected read and never labels unavailable or mismatched observations current and complete

### Requirement: Organization-scoped work-item delivery reads

WBS SHALL resolve organization access and the project/work-item/reference association before external reads. URLs SHALL come only from the authorized stored reference. Unauthenticated, inaccessible, foreign or missing resources SHALL NOT trigger provider reads or disclose foreign records. Delivery observation SHALL NOT mutate planning progress.

#### Scenario: Foreign reference cannot be read

- **WHEN** a caller names another organization's project, another project's work item or another work item's reference
- **THEN** the endpoint refuses consistently with an absent resource and the provider reader is not called

#### Scenario: Authorized linked request

- **WHEN** a member opens delivery for an existing reference on an accessible work item
- **THEN** the endpoint returns the reader's validated observation and leaves work-item progress and references unchanged

### Requirement: Shared provider quota

WBS SHALL serve a reading for the same reference URL from a short in-process cache, limit provider reads per organization and cap concurrent provider reads across the process. Limits SHALL answer typed refusals, never an unavailable reading. A served reading SHALL carry the server's clock so freshness does not depend on the browser clock. A closed request SHALL cancel its provider read.

#### Scenario: Refresh inside the cache window

- **WHEN** any member reads the same reference URL again within the cache window
- **THEN** the endpoint answers the cached reading with its original observation time and makes no provider read

#### Scenario: One organization exhausts its reads

- **WHEN** an organization starts more provider reads than its window allows
- **THEN** the endpoint answers 429 `delivery_rate_limited` with `retryAfterSeconds` and makes no provider read, while other organizations are still served

#### Scenario: Every read slot is taken

- **WHEN** a provider read cannot start within the bounded wait because the process cap is in use
- **THEN** the endpoint answers 503 `delivery_busy`

#### Scenario: The client goes away

- **WHEN** the request's signal aborts during a provider read
- **THEN** the provider read's signal aborts

### Requirement: Explicit delivery UI states

The links editor SHALL provide an on-demand delivery view for saved references with loading, error, rate-limited, busy, unsupported, unavailable, empty, partial and stale states. It SHALL show observation time, change revision/state, merged commit when present, check outcomes and labeled timing. Readings older than five minutes SHALL be stale; late responses for a changed context SHALL NOT replace the current panel. Merged SHALL NOT be presented as deployed, accepted or completed work.

#### Scenario: Fresh, stale and failed refresh

- **WHEN** a successful reading ages beyond five minutes or a later refresh fails
- **THEN** the panel visibly reports stale or failed-refresh state and does not present old checks as current

#### Scenario: Context changes during a read

- **WHEN** the selected link, work item or organization changes before an outstanding read finishes
- **THEN** its late response is discarded or cancelled and cannot populate the new context
