## ADDED Requirements

### Requirement: Retain attributable timing evidence

The system SHALL retain versioned receipts and collection manifests with provider-scoped identities, scope/revision and attempt/execution linkage, source provenance, observation time, timing basis, outcome and completeness. Unknown attribution SHALL be explicit. Content-identified evidence SHALL support offline recomputation. Identical reimports SHALL be idempotent; identity conflicts SHALL be rejected.

#### Scenario: Repeated collection preserves retries

- **WHEN** the same execution is collected twice and its outcome is carried into another attempt
- **THEN** the retained execution contributes work once, both attempts remain visible, and the carried outcome contributes no new execution time

#### Scenario: Missing and conflicting evidence

- **WHEN** a manifest references an absent, unreadable or hash-mismatched receipt, or two receipts conflict under one identity
- **THEN** report generation refuses the invalid bundle and names the fault; it does not publish an improvement claim

### Requirement: Measure only supported intervals

Every measurement SHALL identify endpoints, units, coverage and clock basis. Reports SHALL distinguish execution, setup, queue waiting, attempt-start waiting, retry gaps and deployment latency. Scheduler queue waiting SHALL require enqueue/eligibility and start evidence. Missing endpoints SHALL yield unknown or an explicit censored bound, never zero. Parallel execution sums SHALL NOT be reported as elapsed latency.

#### Scenario: Parallel work and unknown runner queue

- **WHEN** two jobs each execute for 10 minutes concurrently and their runner enqueue times are unavailable
- **THEN** the report shows 20 minutes of work, a 10-minute observed execution span and unknown runner queue time

#### Scenario: Queue timeout followed by retry

- **WHEN** a host wait times out after 1800 seconds and a later attempt acquires after 926 seconds
- **THEN** both outcomes remain visible, measured waiting sums to 2726 seconds, and the gap between attempts is separate or unknown

#### Scenario: Timestamp cannot establish completion

- **WHEN** only a provider record update timestamp or a process exit is available
- **THEN** it does not establish a required verdict completion or a deployed revision's health

### Requirement: Preserve selection and collection context

Collection manifests SHALL retain the workload and execution context defined in the design, including collector version, query window, revision, selection inventory, verdict contract, toolchain, resource, cache and concurrency. Missing context SHALL be explicit. Failed, cancelled, unfinished and superseded attempts SHALL remain visible alongside scan limits/errors. Reports SHALL apply a declared freshness threshold.

#### Scenario: Bounded provider scan

- **WHEN** a provider rate limit, retention limit or scan budget prevents reading all attempts
- **THEN** the report retains available evidence, marks the relevant inventory partial, and refuses a complete-cohort comparison

#### Scenario: Docs work is compared with application work

- **WHEN** baseline uses docs-only validation and candidate uses affected application tests
- **THEN** the comparison names the selection mismatch and is inconclusive

### Requirement: Observe the deployment that actually became healthy

The system SHALL retain each observed dev target, attempt start, phase boundary, hold/refusal and exact-revision health proof. A merged revision that was superseded before being served SHALL be recorded as superseded, without borrowing a successor's success timestamp. Merge-to-health latency SHALL be known only when the merge and health endpoints refer to the same revision or an explicitly proved revision relationship. The first slice SHALL require exact equality for a known value.

#### Scenario: Checkout advances before health

- **WHEN** checkout points at revision B but health still reports A
- **THEN** B remains unproven and its deployment duration remains open/censored

#### Scenario: Poller skips a merged revision

- **WHEN** B is superseded by C before B is served
- **THEN** B has a superseded outcome and C's health does not complete B's deployment interval

### Requirement: Collection cannot alter delivery authority

Autonomous observation SHALL be required for feature acceptance and independent of delivery success. Collection SHALL be bounded and read-only toward providers. It SHALL NOT trigger work, add required checks, wait for remote uploads on the verdict path, mutate progress, bypass locks or alter command exits/signals. Local emission failures SHALL remain visible. Exports SHALL preserve authorized scope and omit secrets and environments.

#### Scenario: Receipt storage fails

- **WHEN** the receipt directory is unwritable during a successful or failed wrapped command
- **THEN** the wrapped command retains its original exit outcome, a distinct observation warning is emitted, and a later report cannot treat the missing receipt as zero time

#### Scenario: Tenant or transport boundary is crossed

- **WHEN** an unauthorized WBS reference or a noncanonical provider URL is supplied
- **THEN** no external read occurs and no receipt belonging to another scope is returned

### Requirement: Make timing improvements falsifiable

JSON and readable reports SHALL expose timelines, overlap, coverage and sources. Comparisons SHALL declare treatment, matching criteria, samples, exclusions, outcomes and a predeclared success rule. Missing coverage, mismatched context, insufficient repetitions or an unmet rule SHALL prevent an improvement claim. Reports SHALL distinguish observed difference from causation; reduced test/safety coverage or worse outcomes SHALL NOT silently qualify as improvement.

#### Scenario: Comparable repeated reduction

- **WHEN** complete matched cohorts meet the predeclared repetition and noise-margin rule, preserve required checks and have no worse failure/cancellation counts
- **THEN** the report states the measured reduction and its limits, and links the receipts that reproduce it

#### Scenario: Faster after dropping a slow failed attempt

- **WHEN** a candidate summary omits a failed or censored attempt included by its cohort rule
- **THEN** the comparison refuses the unsupported claim and identifies the missing attempt

#### Scenario: Fix does not help

- **WHEN** a valid comparison shows no reduction beyond its declared noise margin
- **THEN** the report records no demonstrated improvement; the fix is not described as successful

### Requirement: Preserve timing precision and chronology

Receipts SHALL retain clock domains and timestamp precision. Invalid chronology SHALL be refused or visibly unavailable at the provider boundary; it SHALL NOT be clamped into a nonnegative duration. Reports SHALL expose cross-clock assumptions. Work summaries SHALL count a phase or its child breakdown, not both.

#### Scenario: Clock moves backwards

- **WHEN** an imported interval ends before its start
- **THEN** the importer rejects it; a provider observation with that fault is explicitly unavailable and cannot support a timing comparison

#### Scenario: Nested execution phases

- **WHEN** a 10-minute job contains an 8-minute test step and a 2-minute setup step
- **THEN** its execution total is 10 minutes, with the child phases shown as a breakdown rather than 20 minutes of work

### Requirement: Collect autonomously and resume safely

Enrolled sources SHALL be discovered and collected on a bounded schedule without UI visits or manual collection. Versioned checkpoints SHALL advance only after durable receipt publication. Restart/replay SHALL be idempotent and reconcile unfinished work. Source errors, rate limits, backlog and retention gaps SHALL be visible. Uninitialized and corrupt state SHALL be distinguished; corrupt state SHALL NOT silently reset history.

#### Scenario: No human opens the platform

- **WHEN** an enrolled repository receives runs and the host spool receives receipts while no user opens WBS or invokes collection
- **THEN** scheduled ticks discover and retain them, including failed/cancelled runs and runs with no WBS reference, and publish updated reports on the configured collection schedule, explicitly marking any budget-limited backlog and coverage gap

#### Scenario: Observer dies between persistence and checkpoint

- **WHEN** the observer stops after publishing receipts but before committing its cursor and is restarted
- **THEN** it replays the overlap without duplicate execution accounting or lost attempts and resumes unfinished work

#### Scenario: One source is throttled

- **WHEN** a source reaches its rate limit while another source has pending receipts
- **THEN** bounded ticks honor its retry time, retain backlog, and continue the other source fairly without exceeding the shared request/time budget

### Requirement: Observe the observer independently

The system SHALL expose per-source last success, coverage watermark, backlog, errors, heartbeat and next retry. An independently scheduled inspector and status readers SHALL assess freshness using their own clock. Missing, stale or failed collection SHALL remain distinct from healthy application/CI outcomes. Stopped collection SHALL NOT leave a permanently healthy cached status.

#### Scenario: Collector stops while application is healthy

- **WHEN** collection stops for more than the declared ten-minute freshness threshold while application health remains green
- **THEN** the independent inspector and status readers mark delivery observation stale and retain an observation-gap finding

#### Scenario: Whole observer host is unavailable

- **WHEN** the observer and its local inspector are both unreachable
- **THEN** an external status reader reports unavailable or stale evidence, never infers health from the last green snapshot, and local-only detection is not claimed

### Requirement: Publish deduplicated evidence-linked findings

The observer SHALL automatically publish scoped machine-readable reports and findings after new evidence. Findings SHALL identify their policy, workload cohort, affected phase/metric, evidence, coverage, assessment and first/last seen. Frozen baselines SHALL retain their identities across ticks. Repeated evidence SHALL NOT create duplicate findings or count as independent breaches. Missing policy/coverage SHALL yield needs-evidence rather than an actionable claim.

#### Scenario: Repeated ticks see the same regression

- **WHEN** a policy-qualified regression is observed repeatedly with unchanged evidence
- **THEN** one stable finding remains, its evidence is retained, and no additional breach samples, repair jobs or external notifications are created

#### Scenario: Observation gap follows a regression

- **WHEN** collection becomes incomplete after an actionable regression
- **THEN** the finding is not resolved and the observer does not silently rebaseline to the regressed timings

### Requirement: Evaluate fixes automatically without granting repair authority

A registered fix SHALL identify the finding, immutable baseline, candidate, intended treatment and predeclared success rule. Subsequent observations SHALL automatically update its comparison. Findings SHALL remain unproven when evidence is incomplete; improved requires the declared timing and safety criteria. Observation and finding publication SHALL NOT authorize code execution, merge, deployment or policy changes.

#### Scenario: Candidate merges but evidence is insufficient

- **WHEN** a linked candidate merges and its first run passes, but the comparison lacks the required matched observations
- **THEN** the finding remains evaluating-fix or needs-evidence rather than improved

#### Scenario: Normal work supplies enough evidence

- **WHEN** subsequent scheduled observations supply the declared complete comparable cohort
- **THEN** the observer recomputes and publishes improved or not-improved with reproducible evidence, without an operator invoking compare or automatically applying another fix

### Requirement: Reuse existing telemetry and observation surfaces

The implementation SHALL reuse the existing OTel transport, Elastic searchable history, Kibana dashboards, Prometheus metrics and Alertmanager routing. Dedicated adapters SHALL keep backend-specific transport, queries and names outside the shared domain. Local state SHALL be limited to checkpoints, bounded buffering, reconstructible views and explicitly pinned comparison evidence, not a parallel observability platform.

#### Scenario: Delivery evidence reaches the existing stack

- **WHEN** the autonomous observer collects a receipt and evaluates a finding
- **THEN** their scoped identities and typed fields become queryable through the existing Elastic/Kibana path, metrics are observable in existing Prometheus, and the machine-readable report links that evidence

#### Scenario: Backend replacement preserves the model

- **WHEN** telemetry publication and evidence-query adapters are replaced by contract-test doubles
- **THEN** the same receipt validation, retry accounting, findings and comparison logic run without vendor SDKs or backend query syntax in the domain

### Requirement: Distinguish collected evidence from published evidence

Reports SHALL expose collection, export acceptance and backend visibility separately. Receiver acceptance SHALL NOT prove indexing or metric availability. Backend failure SHALL preserve delivery behavior and yield degraded observation coverage. Bounded replay SHALL retain receipt identities and avoid duplicate work or metric accounting. Pruned or expired evidence SHALL remain an explicit gap; pinned comparison evidence SHALL have independent retention.

#### Scenario: Collector accepts but Elastic has not indexed

- **WHEN** export is acknowledged but the receipt is absent from the scoped backend query
- **THEN** publication remains pending/degraded and the report cannot claim complete searchable evidence or resolve a finding on that basis

#### Scenario: Backend outage followed by replay

- **WHEN** the backend is unavailable and buffered receipts are replayed after recovery
- **THEN** delivery exits are unchanged, backlog is visible, queryable receipts reconcile by identity and replay does not add execution work or histogram observations again

### Requirement: Extend existing alerts and preserve telemetry boundaries

Delivery alerts SHALL use existing Prometheus/Alertmanager rules and routes. Central absent/stale detection SHALL observe the observer independently of its host. Exported attributes SHALL be allowlisted and sanitized; unbounded identities SHALL NOT become metric labels. Evidence queries SHALL enforce scope. Existing retention, ingestion-loss alerts, redaction and authenticated transport SHALL remain effective.

#### Scenario: Observer host stops

- **WHEN** the observer host stops while the central monitoring stack remains healthy
- **THEN** the delivery absent/stale rule fires through the existing alert path and resolves after fresh telemetry returns

#### Scenario: Sensitive attribute or cross-scope query

- **WHEN** an event carries a secret-shaped attribute or a query requests evidence outside the authorized scope
- **THEN** the attribute is removed/redacted before export and the unauthorized query returns no foreign evidence; receipt IDs are not introduced as Prometheus labels
