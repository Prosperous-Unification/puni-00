## ADDED Requirements

### Requirement: Independent bootstrap authority

The system SHALL require externally controlled audit execution, journal verification,
publication and protected admission configuration before issuing trusted activation.
Bootstrap SHALL NOT manufacture credentials, elevate local cooperative evidence, relax the
required workflow, or silently accept missing, unreadable or malformed trusted state.

#### Scenario: Bootstrap prerequisites are absent

- **WHEN** any required identity, verifier, storage authority or protected configuration
  is absent, unreadable or malformed
- **THEN** bootstrap fails with the named condition and no successful admission is issued

#### Scenario: Candidate claims to be its own authority

- **WHEN** candidate-controlled configuration or a relabelled local review claims trusted
  provenance
- **THEN** the independently selected verifier rejects it before publication

### Requirement: Automatic candidate lifecycle

After bootstrap, the system SHALL start or reconcile work for ready pull requests when opened,
marked ready or updated, and for applicable integration and protected-branch push events.
It SHALL require no per-candidate human review record, artifact handling, release creation,
variable editing, workflow rerun or merge action.

#### Scenario: Ready candidate succeeds unattended

- **WHEN** a ready candidate satisfies independently selected reviews and all required checks
- **THEN** the controller publishes its activation, the protected workflow verifies admission,
  and automatic merge proceeds under existing protection without a human action

#### Scenario: Events are missed or duplicated

- **WHEN** event delivery is lost or duplicated
- **THEN** periodic reconciliation recovers eligible work and duplicate delivery does not create
  competing authoritative publications

### Requirement: Exact candidate and trust identity

Every activation request and admission SHALL bind repository identity, candidate head SHA,
base SHA, policy and mapping identities, toolkit identity and audit generation.
Evidence SHALL NOT be reused across changed identities unless an existing explicit
certification contract proves its applicability; candidate-specific review SHALL remain exact.

#### Scenario: Head or base advances during review

- **WHEN** the PR head or base changes before final admission or merge
- **THEN** the old request cannot approve the new tuple and the new tuple is evaluated

#### Scenario: Same tree carries different authority

- **WHEN** source bytes match but repository, policy, mapping, toolkit or generation differs
- **THEN** the previous certificate cannot discharge the new request

### Requirement: Authenticated independent review

Trusted review SHALL retain actual cold and informed invocations, ordered phase evidence,
observed reads, raw responses and measured telemetry required by the review protocol.
An external verifier SHALL authenticate invocation, receipt, obligation, journal and candidate
bindings against independently selected executor authority. Unresolved findings, missing
evidence and incomplete or censored phases SHALL prevent admission.

#### Scenario: Review file looks valid but was not executed

- **WHEN** a schema-valid review names an invocation absent from the authenticated journal
- **THEN** publication and admission refuse it

#### Scenario: Review evidence is incomplete

- **WHEN** a phase, required read, retained response, required telemetry or finding disposition
  is absent, unreadable, malformed or mismatched
- **THEN** the request fails without synthesizing the missing observation

### Requirement: Isolated checks and protected publication

Candidate execution SHALL have no access to audit signing, journal mutation, activation
publication, protected checks or merge credentials. Required checks SHALL record actual
commands, execution identities, outputs, exit statuses and skips; failed or skipped required
work SHALL prevent certification. The trusted preparer SHALL validate every activation role
and the production launcher before publication.

#### Scenario: Candidate attempts credential or journal access

- **WHEN** candidate code attempts to use publication credentials or alter authenticated records
- **THEN** isolation denies the access and the candidate cannot issue trusted approval

#### Scenario: Required command fails or skips work

- **WHEN** a selected command exits unsuccessfully or reports skipped required work
- **THEN** no certified activation or successful admission is published

### Requirement: Immutable candidate-addressed selection

The system SHALL publish immutable activation archives with authenticated descriptors joining
the complete request identity, archive digest and role identities. Consumers SHALL resolve
only through an independently configured trust source and verify both provenance and content.
Different candidates SHALL have independent selections after bootstrap.

#### Scenario: Two candidates finish concurrently

- **WHEN** candidates A and B complete in either order
- **THEN** each resolves its own exact activation without overwriting the other's selection

#### Scenario: Archive or descriptor is substituted

- **WHEN** archive bytes, role bytes, descriptor bindings or the selected issuer differ from
  authenticated expectations
- **THEN** the production consumer refuses admission before executing an untrusted launcher

#### Scenario: Existing publication conflicts

- **WHEN** a publication key already contains different bytes or authenticated identities
- **THEN** the controller fails without replacing it; an identical existing publication is
  verified before being reused

### Requirement: Protected workflow and merge identities

The required trusted workflow SHALL remain enforced and SHALL independently verify exact
candidate admission. A controller status alone SHALL NOT replace a workflow required by the
organization ruleset. Automatic merge SHALL use current required-check conclusions and exact
head preconditions, with base freshness enforced through protected up-to-date checks or a
verified merge queue. The controller SHALL NOT bypass protection on failure.

#### Scenario: Stale approval reaches merge

- **WHEN** the head or protected integration base changes after successful evaluation
- **THEN** merge refuses the stale approval and schedules the current candidate for evaluation

#### Scenario: Unrelated identity forges a green status

- **WHEN** another actor reports success without the required authenticated activation
- **THEN** the required workflow still refuses admission

#### Scenario: Merge queue recomposes the candidate

- **WHEN** a merge group changes its base or membership
- **THEN** the newly composed identity requires its own checks and applicable review before merge

### Requirement: Actual merged revision certification

The actual merged SHA SHALL receive its own exact certification before downstream admission.
The system SHALL NOT treat a checked PR head, merge-group SHA, ancestor or equal tree as a
certificate for another commit. Existing sole-parent integration-binding constraints SHALL
remain enforced unless changed by a separately specified and proven contract.

#### Scenario: GitHub creates a different merge SHA

- **WHEN** merge creates a commit different from the admitted PR or merge-group SHA
- **THEN** downstream admission waits for certification of the actual commit

#### Scenario: Ordinary merge is passed to sole-parent binding

- **WHEN** a two-parent GitHub merge is presented to the existing sole-parent binding emitter
- **THEN** the binding is refused rather than weakening the parent check

### Requirement: Durable bounded recovery

The controller SHALL persist stage ownership, immutable request identities and external effect
identities outside candidate storage. Recovery SHALL verify completed effects before resuming,
fence obsolete workers, and bound retries for transient faults. Exhaustion or an unmodeled
failure SHALL report a terminal failure without automatic bypass or fabricated success.

#### Scenario: Publication succeeds but response is lost

- **WHEN** the publisher crashes after publication and before recording success
- **THEN** recovery authenticates the existing immutable publication and resumes once without
  replacing it or issuing duplicate merge actions

#### Scenario: Lease expires while an old worker finishes

- **WHEN** a replacement worker owns the request after expiry
- **THEN** the obsolete worker cannot publish, advance state or merge under the old ownership

#### Scenario: Retry budget is exhausted

- **WHEN** transient failures exceed the configured attempt or elapsed-time bound
- **THEN** the request visibly fails with the unresolved condition and retains diagnostic evidence

### Requirement: Host retention and closure evidence

Host admission SHALL consume the same authenticated archive as CI and verify its exact
revision before use. Retention SHALL preserve referenced archives and review evidence for
the configured admission and audit lifetime. WBS closure SHALL require observed unattended
end-to-end execution, not a design packet or mocked provider.

#### Scenario: Host copy is missing or corrupt

- **WHEN** the host archive is absent, unreadable or differs from its authenticated digest
- **THEN** host admission fails; reconciliation repairs only from the trusted retained source

#### Scenario: Design exists but external authority is absent

- **WHEN** only design or simulated provider evidence exists
- **THEN** WBS 030.6 remains incomplete and the bootstrap prerequisite remains explicit
