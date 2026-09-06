## ADDED Requirements

### Requirement: Architectural design is evaluated before planning

The Twilight fast-forward workflow MUST traverse design before declaring planning
ready. `design.md` MUST always exist for a `twilight-v1` change; a mechanically
obvious change MUST record why no technical design is needed in that file's
applicability section rather than in `tasks.md`. Verification MUST remain
post-work and MUST NOT be an apply prerequisite; it is an obligation of handoff
and archive, stated in the verify artifact instruction until a verifier enforces it.

#### Scenario: An architectural change is fast-forwarded

- **WHEN** intent and specifications exist but architectural design does not
- **THEN** fast-forward includes design in its required traversal and evaluates
  its instruction before completing the task artifact

#### Scenario: A mechanically obvious change needs no design

- **WHEN** the design applicability assessment finds no non-trivial technical shape
- **THEN** `design.md` is created holding its applicability section and nothing
  else, planning proceeds, and no verification evidence is pre-written

#### Scenario: Verification is absent when work begins

- **WHEN** intent, specifications, design and tasks exist and `verify.md` does not
- **THEN** apply reports ready rather than blocked, and the handoff obligation for
  `verify.md` is carried by the verify artifact instruction

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
or installed variants, and MUST reject any file present under a generated output
root that generation did not compute. Generation MUST preserve provider-specific
invocation names and fail on unsupported inputs rather than silently omitting a
workflow. Generated formatting MUST come from the repository's own prettier
configuration rather than a copy of it. Every generated copy MUST name the source
file a human should edit instead, exactly once however many times generation runs.

#### Scenario: One installed provider workflow drifts

- **WHEN** a generated workflow is edited or deleted independently of its canonical source
- **THEN** the gate fails naming the affected file, and regeneration restores it

#### Scenario: A required source cannot be read

- **WHEN** a canonical source is absent or unreadable
- **THEN** generation and checking fail visibly before claiming successful consistency

#### Scenario: A file is added under a generated output root

- **WHEN** a file generation did not compute appears under a generated skill or
  command directory
- **THEN** both checking and generation fail naming that path, rather than
  comparing only the computed set and reporting consistency

#### Scenario: The repository formatting configuration is unusable

- **WHEN** the repository's prettier configuration is absent, unreadable or not a
  JSON object
- **THEN** generation and checking stop naming that file, rather than formatting
  with defaults that would then disagree with the repository format gate

#### Scenario: A human opens a generated copy

- **WHEN** a generated skill or command is read
- **THEN** it carries one line naming the canonical source to edit instead, and
  repeated generation neither removes it nor adds a second

### Requirement: The pinned CLI graph is checked by the merge gate

The reproducibility gate MUST include a check that runs the pinned OpenSpec CLI
against the Twilight schema in a disposable repository. That check MUST NOT be
reachable only by a developer who sets an environment variable by hand.

#### Scenario: The planning dependency is broken on a branch

- **WHEN** the design dependency is removed from the Twilight schema
- **THEN** a continuous-integration step running the pinned CLI fails, rather than
  the branch merging with a proof comment describing a check nothing ran
