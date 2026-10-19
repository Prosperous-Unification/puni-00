## ADDED Requirements

### Requirement: Filesystem extraction releases compiler programs between projects

The filesystem compatibility extractor SHALL release each compiler program before constructing the next project program and SHALL preserve all requested import, diagnostic, declaration and public-surface checks. It SHALL complete the committed serial-compiler regression workload within the recorded resource ceiling without changing policy or reducing requested configs.

#### Scenario: Shared declaration programs remain within the workload ceiling

- **GIVEN** the committed workload contains many configs importing one shared declaration surface and one unique public owner
- **WHEN** the production relationship CLI evaluates its immutable commit under the recorded process-tree guard
- **THEN** it returns the complete expected relationship report within the ceiling
- **AND** restoring simultaneous compiler retention causes that same assertion to fail

### Requirement: Serial extraction preserves semantic output and refusal precedence

Serial filesystem extraction SHALL preserve relationship and configuration identities, public closure, emitting-owner selection, and phase precedence: parsing, imports, diagnostics, emission, then each public entrypoint in request order. Unexpected failures SHALL propagate immediately.

#### Scenario: Conflicting failures preserve the earlier phase

- **GIVEN** a candidate has an earlier config import failure and a later config parse failure
- **WHEN** the filesystem extractor evaluates all requested configs
- **THEN** the parse failure is reported before the import failure

#### Scenario: Public ownership and semantic closure are preserved

- **GIVEN** importing programs and one explicit emitting owner share a public entrypoint with transitive and ambient declarations
- **WHEN** serial and predecessor extraction evaluate the same committed candidate
- **THEN** their complete reports and identities are equal
- **AND** zero or ambiguous owners retain their existing refusals

### Requirement: Bounded-source accounting remains unchanged

The bounded-source extractor SHALL retain its existing callback order, repeated-work charges, finite-budget acceptance and refusal behavior. Legacy replay SHALL NOT reset, bypass or reinterpret a bounded-source budget.

#### Scenario: Exact-fit bounded extraction remains exact

- **GIVEN** a source fixture fits its measured probe, read and observation limits exactly
- **WHEN** the bounded-source extractor evaluates it and each one-unit-short limit
- **THEN** exact fit succeeds and each insufficient limit retains its refusal

### Requirement: Legacy semantic phases collect preceding compiler work

The filesystem compatibility extractor SHALL retain collection after each compiler-owning helper and SHALL collect again after reconstruction and import observation immediately before semantic diagnostics, including diagnostics replayed for emission/public surfaces. The current project SHALL remain available for all required checks; no config, diagnostic or callback budget SHALL be skipped or weakened.

#### Scenario: Legacy collection boundaries permit the frozen workload

- **GIVEN** the frozen WBS baseline and unchanged all-rule policy recorded in the follow-up evidence
- **WHEN** the separately identified installed successor evaluates every selected configuration under the recorded 4 GiB process-tree ceiling and 900-second deadline
- **THEN** the process returns its complete report without a resource stop
- **AND** existing semantic refusals remain explicit rather than being accepted or hidden
- **AND** the preserved predecessor without this collection placement demonstrates the production resource failure

### Requirement: Legacy public closure collects preceding semantic work

The filesystem compatibility extractor SHALL collect once after semantic declaration dependency discovery completes and before emitted declaration dependency traversal begins. The current program, declarations and semantic dependency selections SHALL remain available. The bounded-source extractor SHALL retain its existing callback and accounting sequence without this collection callback.

#### Scenario: Public closure completes without changing the full report

- **GIVEN** the frozen WBS baseline and unchanged policy whose two-point candidate exceeded the recorded resource guard during emitted declaration traversal
- **WHEN** the separately identified installed candidate adds the generic legacy public collection boundary
- **THEN** its complete report is produced within the same 4 GiB/900-second guard
- **AND** the complete JSON equals the retained successful targeted diagnostic report, including all findings and explicit unevaluated rules
- **AND** focused bounded-source exact-fit and insufficient-budget behavior remains unchanged
