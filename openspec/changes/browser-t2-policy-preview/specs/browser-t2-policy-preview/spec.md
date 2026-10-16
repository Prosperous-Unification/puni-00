## ADDED Requirements

### Requirement: Preview consumes one exact real Browser T2 observation

The system SHALL provide `inspect-browser-t2-policy <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> <external-proposed-policy> --now <UTC-instant>` with exact operands and explicit validated time. It SHALL call the real Browser T2 inspector, verify its complete digest and literal absent-authentication/false-certification markers, and match the requested revision, capability and normalized instant. It SHALL accept no supplied observation JSON or candidate execution and SHALL preserve upstream refusal behavior without filtering the full B3 tree.

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-001] Real upstream inspection remains required

- **WHEN** a well-formed proposed policy is supplied but the actual publication, required upstream authority or B3 selection cannot be inspected
- **THEN** the command refuses with named stderr and no JSON rather than trusting the proposal's digest

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-002] Exact selection and explicit instant are mandatory

- **WHEN** operands are missing or extra, selection is symbolic or not the requested commit, or the explicit UTC instant is missing or invalid
- **THEN** the command refuses without a preview or ambient-time substitution

### Requirement: Proposed citation policy is a strict captured proposal

The preview SHALL read a regular external proposed policy at a canonical absolute path outside the candidate without symlink components, capture its bytes once, and strictly decode schema one with no undeclared keys. The record SHALL have kind `proposed-browser-citation-policy`, a binding containing exact revision, candidate, capability, canonical evaluatedAt, rulePolicyDigest and browserT2ObservationDigest, and a disposition containing mode observe/enforce or mode ratchet with explicit unique canonical relative adoptedPrefixes. Observe/enforce SHALL reject adoptedPrefixes. Ratchet SHALL accept an empty list and overlapping distinct prefixes, reject invalid paths and duplicates, and SHALL NOT use prefixes to filter inspected cases. Every binding field SHALL equal the actual upstream observation. The proposal's outside location or digest SHALL establish no authenticity.

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-003] Invalid or unavailable proposed policy refuses

- **WHEN** the file is absent, unreadable, symlinked, internal, nonregular, malformed UTF-8/JSON, an unsupported version, or contains unknown/missing fields
- **THEN** the command refuses without JSON or a default policy

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-004] A valid proposal describes another observation

- **WHEN** any binding field differs, including a validly recomputed digest for another invocation or evaluation instant
- **THEN** the command refuses instead of previewing the current observation under that proposal

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-005] Ratchet inputs are explicit and canonical

- **WHEN** a ratchet proposal supplies an empty list or distinct overlapping canonical prefixes
- **THEN** the proposal is valid and empty adoption assigns no citation refusal
- **AND** omission, duplicate prefixes, dot segments, traversal, globs or noncanonical paths refuse; observe/enforce proposals containing prefixes also refuse

### Requirement: Every citation violation receives its proposed effect

The preview SHALL preserve every upstream case and assign exactly one finding to each missing, malformed or inactive citation, with the exact caseId, source file path, citation kind and proposed effect. Non-cited cases and upstream citation findings SHALL form an exact bijection with equal kind, terminal title and status; duplicate, omitted, conflicting, foreign or impossible rows SHALL refuse. Observe SHALL produce debt, enforce SHALL produce refusal, and ratchet SHALL produce refusal only for a file equal to an adopted prefix or beneath its slash boundary. Findings SHALL sort by canonical caseId. Passed, failed and skipped outcomes SHALL not suppress citation violations. A valid active citation to another capability SHALL remain valid. Nested ledger debt SHALL not become a citation violation.

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-006] Modes differ for the same missing citation

- **WHEN** one real case lacks a citation and is previewed under observe, enforce and ratchet proposals
- **THEN** observe yields debt, enforce yields refusal, and ratchet yields refusal exactly inside the adopted set while preserving the same case identity

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-007] Similar prefix is not adopted

- **WHEN** adopted prefix `src/foo` is evaluated against files `src/foo`, `src/foo/case.ts` and `src/foo-other/case.ts`
- **THEN** the first two are adopted and the third is outside adoption

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-008] Outcomes and ledger debt stay independent

- **WHEN** cases include uncited passed/failed/skipped outcomes, a cited failed case, an active citation to another capability and unrelated ledger debt
- **THEN** all uncited cases receive findings, both valid citations receive none, and every case and all original debt remain present

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-009] Dependency partition is incomplete or inconsistent

- **WHEN** a dependency supplies a resealed envelope with duplicate case IDs, a missing/foreign finding, altered citation kind/title/status or an impossible citation variant
- **THEN** the production command refuses without a partial preview

### Requirement: Preview identity and command status convey only proposed citation effects

The schema-one `browser-t2-policy-preview` envelope SHALL retain exact selection, capability, instant, publication scope, rule-policy identity, captured decoded proposedPolicy and raw proposedPolicyDigest, complete browserT2 and browserT2ObservationDigest, sorted findings and proposedDisposition. The disposition SHALL be citation-refusals exactly when a finding has effect refusal, otherwise no-citation-refusals. Authentication SHALL remain absent and certifies SHALL remain literal false. The observationDigest SHALL bind the complete payload excluding itself. Identical inputs SHALL produce identical output; changed raw proposal bytes SHALL change identity even when effects agree. No new allowed, accepted, covered, passed, receipt or certification claim SHALL be emitted.

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-010] Proposed refusal emits a diagnostic and nonzero status

- **WHEN** any citation finding has effect refusal
- **THEN** complete diagnostic JSON reports citation-refusals and the CLI exits one without admission authority

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-011] Debt does not refuse a proposal

- **WHEN** the valid preview has no citation refusals but has observe debt, failed/skipped tests or nested ledger debt
- **THEN** complete JSON reports no-citation-refusals and exits zero without claiming successful tests, coverage or admission

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-012] Complete identity and installed dispatch are preserved

- **WHEN** the same inputs are inspected through source and built installed dispatch
- **THEN** JSON and exit semantics match, the full payload digest recomputes exactly, and raw proposal byte changes alter identity without changing equivalent effects
- **AND** invalid inputs produce named stderr and no JSON through both routes

### Requirement: Preview leaves enforcement and trusted acceptance separate

The preview SHALL NOT register T2, change RulePolicy, grant tested-module or coverage credit, authenticate execution, install trust, authorize admission or alter existing Browser T2/source/level/ledger commands. Implementation SHALL require production-path R5 negatives with observed guard/dependency faults and restored controls. Fixture success and a no-citation-refusals preview SHALL NOT close WBS080.39, whole-tree source reconciliation or existing test-axes acceptance tasks.

#### Scenario: [BROWSER-T2-POLICY-PREVIEW-013] Caller requests authority from a consistent preview

- **WHEN** a caller supplies a consistent proposed policy and receives no-citation-refusals
- **THEN** authentication remains absent, certification remains false, no registry/policy/trust state changes, and existing diagnostics retain their original behavior
