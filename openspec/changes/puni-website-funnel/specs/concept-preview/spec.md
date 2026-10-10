## ADDED Requirements

### Requirement: Optional safe concept preview

After a request brief exists, the system SHALL offer an optional concept preview with at most one generation and one revision. The API SHALL validate provider output against a versioned typed JSON schema and the app SHALL render only fixed safe components with no generated code execution, arbitrary URLs, network access or storage access. The preview SHALL be labelled as a concept; any simulated authentication MUST be visibly distinct from PUNI sign-in. The prospect SHALL remain able to submit without a preview.

#### Scenario: Valid concept

- **WHEN** a preview generation returns a valid component tree within its separate output allowance
- **THEN** the app renders the bounded concept, marks simulated controls and allows brief review

#### Scenario: Malicious or malformed tree

- **WHEN** output contains script, HTML, CSS, remote URL, unknown component or out-of-schema nesting
- **THEN** the API rejects it before persistence and the renderer executes or fetches nothing

#### Scenario: Optional path

- **WHEN** a prospect requests a proposal with no preview or after preview capacity is exhausted
- **THEN** proposal submission remains available
