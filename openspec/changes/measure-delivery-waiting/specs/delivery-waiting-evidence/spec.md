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

Collection SHALL be bounded, read-only and optional, with local host emission and visible failure outcomes. It SHALL NOT trigger work, add required checks, delay verdicts on remote uploads, mutate progress, bypass locks or alter command exit/signal behavior. Observation failure SHALL remain distinct from delivery outcome. Exports SHALL preserve authorized scope and omit secrets and command environments.

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
