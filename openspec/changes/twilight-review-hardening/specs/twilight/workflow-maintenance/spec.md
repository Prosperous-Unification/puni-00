## ADDED Requirements

### Requirement: Architectural design is evaluated before planning

The Twilight fast-forward workflow MUST traverse design applicability before
declaring planning ready. It MUST create and review design for architecture,
contracts, external effects, security, migrations and workflow behavior. Omission
for mechanically obvious work MUST have an explicit reason. Verification MUST
remain post-work.

#### Scenario: An architectural change is fast-forwarded

- **WHEN** intent and specifications exist but architectural design does not
- **THEN** fast-forward includes design in its required traversal and evaluates
  its instruction before completing the task artifact

#### Scenario: A mechanically obvious change needs no design

- **WHEN** the design applicability assessment finds no non-trivial technical shape
- **THEN** the workflow records the omission reason and continues without creating
  an empty design or pre-writing verification evidence

### Requirement: Archive input failures are explicit

Archive and bulk archive MUST distinguish successful optional absence from command
or parsing failure. Unexpected failure MUST stop the operation and report the
failed input. A specifically identified unsupported archive-instructions command
MUST be reported as unavailable, preserving project rules and normal archive checks.

#### Scenario: Archive instructions return malformed JSON

- **WHEN** the instructions lookup succeeds but returns malformed JSON
- **THEN** archive stops before changing specs or moving the change and reports
  the parsing failure rather than treating required context as absent

#### Scenario: Optional fields are absent from a valid response

- **WHEN** a successful valid response omits optional context or guidance fields
- **THEN** archive continues through its normal checks under the existing project rules

### Requirement: Workflow variants are reproducible

Repository workflow variants MUST be generated from canonical checked-in sources.
The repository gate MUST reject missing, unreadable or divergent required sources
or installed variants. Generation MUST preserve provider-specific invocation names
and fail on unsupported inputs rather than silently omitting a workflow.

#### Scenario: One installed provider workflow drifts

- **WHEN** a generated workflow is edited or deleted independently of its canonical source
- **THEN** the gate fails naming the affected file, and regeneration restores it

#### Scenario: A required source cannot be read

- **WHEN** a canonical source is absent or unreadable
- **THEN** generation and checking fail visibly before claiming successful consistency
