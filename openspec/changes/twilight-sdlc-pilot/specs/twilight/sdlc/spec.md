## ADDED Requirements

### Requirement: Opt-in artifact workflow

The Twilight pilot SHALL use a named schema selected per change. Its artifact
classes MUST be `proposal.md`, `specs/**/*.md`, `design.md`, `tasks.md` and
post-work `verify.md`. `design.md` MUST exist before planning starts; for a
mechanically obvious change it MUST carry an applicability statement recording why
no technical design is needed, and nothing else. `verify.md` MUST be an obligation
of handoff and archive rather than of apply readiness, which requires intent,
specifications and tasks only. The repository's default schema MUST remain
unchanged by opting into the pilot.

#### Scenario: Existing work retains its workflow

- **WHEN** a change selects `twilight-v1`
- **THEN** its instructions use that schema and `openspec/config.yaml` still
  selects `sdd-lean` for existing/default work

#### Scenario: Tasks cannot stand in for absent planning inputs

- **WHEN** only `tasks.md` exists for a `twilight-v1` change
- **THEN** apply instructions report blocked and identify absent intent/specs

#### Scenario: Planning waits for the design decision

- **WHEN** a `twilight-v1` change has intent and specifications but no `design.md`
- **THEN** status reports the tasks artifact blocked and names design as its
  missing input, and an applicability-only `design.md` unblocks it

#### Scenario: Apply readiness does not wait for verification

- **WHEN** intent, specifications, design and tasks exist and `verify.md` does not
- **THEN** apply reports ready, while the handoff and archive obligation for
  `verify.md` stays stated in the verify artifact instruction until the future
  `tool-twilight` verifier enforces it

### Requirement: Assumption-based discovery

The workflow MUST record provisional answers separately from human decisions
when the request authorizes autonomous discovery. Each assumption MUST identify
an owner, its rationale, and a condition that reopens dependent work.

#### Scenario: No-question planning request

- **WHEN** the user requests a plan without clarification pauses
- **THEN** discovery produces explicit provisional answers and continues within
  that scope without inventing approval for later actions

### Requirement: Inspectable stages with one plan

The workflow MUST map the canonical stages `request`, `discovery`, `specification`,
`planning`, `implementation`, `review`, `verification`, `acceptance`, `handoff` and
`release` onto the canonical artifacts and attributable evidence, using those stage
ids. `tasks.md` MUST be the only hand-maintained implementation plan. A focus brief
MUST be a view of that work.

#### Scenario: Focus brief keeps obligations

- **WHEN** a person uses the focus profile selected in the execution profile
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
