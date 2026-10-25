## ADDED Requirements

### Requirement: Production has an isolated platform target

Production SHALL use `website-prod`, with platform-owned restricted admission and bidirectional default-deny. Fleet SHALL own workloads and explicit allow rules. Production SHALL have its own PVC, Secret resources, backup prefix, receipts and inference activation configuration; preparation SHALL NOT copy development prospects or implicitly enable erasure, inference or public traffic.

#### Scenario: Production isolation is weakened

- **WHEN** the production namespace loses its restricted admission or bidirectional default-deny policy
- **THEN** the platform check refuses the candidate and names the missing protection

#### Scenario: Development resources are reused

- **WHEN** a production workload, backup destination or release pin refers to development state
- **THEN** the fleet/release check refuses before activation and identifies the cross-environment reference

### Requirement: Artifacts declare their environment

New releases SHALL declare `development` or `production` and exact site/app origins. Production SHALL use `https://puni.dev` and `https://app.puni.dev`; development SHALL retain its hosts. Build/pin tools SHALL refuse unknown or mismatched environments and a development analytics ID enabled on production. Disabled analytics SHALL require no invented ID. Historical absent environment metadata SHALL identify development only within its existing receipt path.

#### Scenario: Development artifact is pinned to production

- **WHEN** production pinning receives a release built for development
- **THEN** it refuses before any manifest, receipt or Git commit is changed

#### Scenario: Missing production analytics ID

- **WHEN** a production candidate is built without a production measurement ID
- **THEN** analytics remains disabled and the manual/chat request funnel still builds and functions

### Requirement: Every canonical dependency participates in release identity

The private snapshot and artifact receipt SHALL verify the complete declared canonical public dependency closure from a committed public revision, including the shared analytics adapter. Licensed private source SHALL remain private. Existing four-tree receipts SHALL remain readable as historical records; new releases SHALL require the actual current closure, without fabricated historical tree IDs.

#### Scenario: Shared analytics tree drifts

- **WHEN** the private snapshot analytics source differs from the selected committed public tree
- **THEN** release preparation refuses before producing a pinnable artifact

### Requirement: Pin and rollback require the scoping protocol

Pinning and rollback SHALL require API capability `conversion-scoping/1` alongside active retention capabilities. It SHALL preserve versioned drafts, raw Retry, structured replies, failure/accounting and retention. Inference, landing or analytics changes SHALL NOT waive this minimum. Rollback SHALL refuse an incompatible backend before mutating fleet state.

#### Scenario: Previous API predates scoping

- **WHEN** rollback selects a receipt lacking `conversion-scoping/1`, including with inference disabled
- **THEN** it refuses without changing pins or deleting receipts and identifies the required compatible target

#### Scenario: Compatible baseline receives old and new drafts

- **WHEN** the candidate and its prepared compatible baseline are each run against a disposable database containing legacy and versioned drafts
- **THEN** both preserve exact reviewed content and references, valid Retry/replay, proposal recovery and accounting without silently downgrading versioned state

### Requirement: A compatible baseline precedes the new landing flow

Release preparation SHALL produce and identify a compatible baseline before the new landing flow is activated. For the first rollout, the baseline SHALL retain the prior landing behavior while using the scoping-capable canonical app/API. Later rollback SHALL choose a tested compatible receipt. Code rollback SHALL NOT automatically execute destructive down migrations or restore an older database over newer requests.

#### Scenario: No compatible rollback receipt exists

- **WHEN** the launch candidate has no prepared compatible baseline and disposable rollback proof
- **THEN** launch readiness remains incomplete and the candidate is not presented as ready to activate

### Requirement: Release claims distinguish local and live evidence

The release record SHALL name exact revisions/artifacts, the host gate, disposable rollback, consent and disabled-inference submission checks. Live readiness SHALL additionally require verified secrets/origins, provider cap/configuration, fresh backup restore, release identity and a preview request visible to the human owner. Missing tools or credentials SHALL remain unverified. Health alone SHALL NOT prove release identity, deletion, model quality or analytics settings.

#### Scenario: Only local fixtures passed

- **WHEN** the candidate passes local browser and release tests but current cluster credentials or backup evidence are unavailable
- **THEN** the record says prepared and locally verified, lists the missing live checks and makes no production-readiness or deployment claim

#### Scenario: Activation has not been authorized

- **WHEN** preparation is complete but public cutover has not been authorized
- **THEN** the concrete candidate and exact operator actions are presented for approval without changing DNS, live pins or production activation
