## ADDED Requirements

### Requirement: Bounded export value model

The frontend SHALL define its six export model types in a framework-free scoped
module and SHALL preserve their public type exports through `plan-export.ts`.
Both production files SHALL contain fewer than 800 lines under the unchanged F7
survey policy.

#### Scenario: Installed evaluator accepts the extracted boundary

- **WHEN** the installed Twilight Burokrat evaluates the exact committed candidate
  with the existing survey policy and F7 selector
- **THEN** the production `plan-export.ts` F7 finding is absent
- **AND** restoring the oversized production file in a disposable candidate makes
  the selected-finding assertion fail
- **AND** unrelated F7 findings and selected-rule unevaluated entries are unchanged

### Requirement: Export behavior survives model extraction

The export writers SHALL preserve CSV, Markdown, Mermaid and bundled Mermaid
bytes for the same input. Formatting, escaping, caches and filenames SHALL remain
in the original modules.

#### Scenario: Existing public consumers remain valid

- **WHEN** the frontend typechecks existing table, action and Mermaid consumers
- **THEN** their imports from `plan-export.ts` remain valid without caller edits

#### Scenario: Fixed input retains every document byte

- **WHEN** the writers receive a fixed plan with row text requiring escaping
- **THEN** all four generated documents match their pre-extraction byte fingerprints
- **AND** the original export and Mermaid suites retain their assertions
