## ADDED Requirements

### Requirement: Dash claims, reports and releases through WBS as one agent person

Twilight Dash SHALL read startable work and write claims, progress, measures, releases and
external refs through the WBS HTTP API under one machine credential (pinned to the coordinator's agent person),
using the shared contracts shapes. Each write SHALL be one plan command batch. Every refusal
code the WBS specs name SHALL be a typed outcome; an unlisted code SHALL throw. A claim SHALL
carry the attempt's agent run. `token_actual` SHALL be written only when usage is measured.

#### Scenario: A startable step is claimed with the run id

- **WHEN** the bridge claims step `impl` of leaf `080.25` for an attempt whose adapter session
  is `sess-42`
- **THEN** WBS holds one claim on that step with the coordinator's agent person and run id `sess-42`
  and the step's progress reads `in_progress`

#### Scenario: A lost race is a typed outcome

- **WHEN** another holder claimed the same step between the startable read and the claim
- **THEN** the bridge returns `already_claimed` naming the holder and writes nothing else

#### Scenario: An unbound credential refuses before work starts

- **WHEN** the coordinator's credential is not linked to an account that may act as the
  agent person
- **THEN** the first write returns `person_not_bound` and no attempt leaves `queued`

#### Scenario: Unknown usage leaves the measure absent

- **WHEN** an attempt succeeds with usage `unknown`
- **THEN** progress is stated `done`, `token_actual` is not written, and the attempt record
  names the reason
