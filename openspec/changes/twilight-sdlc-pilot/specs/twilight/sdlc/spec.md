## ADDED Requirements

### Requirement: Opt-in artifact workflow

The Twilight pilot SHALL use a named schema selected per change. It MUST retain
`proposal.md`, `specs/**/*.md`, `tasks.md`, and post-work `verify.md` as its four
required artifact classes. Technical design MUST be recorded when non-trivial.
The repository's default schema MUST remain unchanged by opting into the pilot.

#### Scenario: Existing work retains its workflow

- **WHEN** a change selects `twilight-v1`
- **THEN** its instructions use that schema and `openspec/config.yaml` still
  selects `sdd-lean` for existing/default work

#### Scenario: Tasks cannot stand in for absent planning inputs

- **WHEN** only `tasks.md` exists for a `twilight-v1` change
- **THEN** apply instructions report blocked and identify absent intent/specs

### Requirement: Assumption-based discovery

The workflow MUST record provisional answers separately from human decisions
when the request authorizes autonomous discovery. Each assumption MUST identify
an owner, its rationale, and a condition that reopens dependent work.

#### Scenario: No-question planning request

- **WHEN** the user requests a plan without clarification pauses
- **THEN** discovery produces explicit provisional answers and continues within
  that scope without inventing approval for later actions

### Requirement: Inspectable stages with one plan

The workflow MUST map request, discovery, specification, planning, implementation,
review, verification, development acceptance, knowledge handoff, and release onto
the canonical artifacts and attributable evidence. `tasks.md` MUST be the only
hand-maintained implementation plan. A focus brief MUST be a view of that work.

#### Scenario: Focus view keeps obligations

- **WHEN** a person uses the optional focus profile
- **THEN** one next action and a resume cue are shown with access to the same
  requirements, decisions, evidence, and completion conditions as the full view

### Requirement: Honest completion evidence

The pilot MUST distinguish CLI structure/existence checks, actual command
observations, attributed reviews, and unexecuted runtime scenarios. Required
checks not run MUST be reported explicitly. CLI progress MUST NOT be described
as a verified runtime outcome.

#### Scenario: Checked tasks have no runtime evidence

- **WHEN** all task checkboxes are checked but no execution occurred
- **THEN** the trial records any CLI `all_done` response as file progress only
  and refuses to claim implementation, approval, or deployment was verified

#### Scenario: An adversarial CLI probe

- **WHEN** a spec's scenario heading is deliberately malformed in a disposable copy
- **THEN** the trial records the failing validator output and the restored pass

### Requirement: Delivery applicability is explicit

A documentation-only trial MUST record browser/deployment stages as inapplicable
with reasons. Future application work MUST carry real integrated and browser
evidence before development acceptance. Production MUST require an explicit human
command covering the candidate and environment.

#### Scenario: Documentation pilot closes

- **WHEN** the current planning and documentation trial is handed off
- **THEN** its verification report identifies the product implementation and
  runtime proofs as unexecuted and makes no release claim
