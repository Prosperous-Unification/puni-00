# Task 1.1 report — execution-aware source certification

## Scope completed

- Added an independently typed manifest for all seventeen transactional and
  two history store families, preserving every existing case ID and declaring
  the exact common and admission-specific history cases.
- Added the typed capability, gap, deterministic seed, reader and scenario
  protocol from the approved design.
- Added a case runner that distinguishes declaration from execution, owns
  fixture cleanup before assigning pass, records setup/assertion/cleanup
  failures, emits not-offered cases from exact absent/gap declarations and
  marks focused runs partial.
- Added terminal certification for exact expected/registration/report sets,
  duplicate and unknown cases/gaps, capability/status agreement and failed or
  incomplete execution.
- Preserved the legacy four-family runner for task 1.3; only its declaration
  type was renamed internally to avoid colliding with the new exported type.

## Evidence

Every new safety assertion has a neighboring `Proof:` comment taken from an
observed mutation. The compile fixture extends `TransactionalStores` with
`conformanceProbe`; without its expected-error guard, the real root
`conformance:typecheck` fails on TS2741 because the manifest lacks that family.
The full command and fault table are in
`openspec/changes/source-conformance-completion/verify.md`.

## Verification summary

- Conformance: 12 tests passed; lint and typecheck passed.
- Compatibility: memory and SQLite typechecks passed; the existing memory
  source conformance file passed 20 with its one known gap skipped, and SQLite
  passed all 14.
- Skipped by scope: full workspace gate, full source suites, browser/build
  gates and not-yet-created source certification targets.

## Concerns for later slices

- Task 1.3 must replace the legacy runner rather than maintaining two permanent
  report models.
- Store-kit registration should use `CaseRegistration.openAndRun` closures so
  the generic runner never erases a family port type.
- Source factories must pass their declaration into `runCases`; otherwise an
  exact gap would execute instead of receiving `not-offered`.
