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
