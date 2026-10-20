## ADDED Requirements

### Requirement: Attempts move through named states and survive a restart

Twilight Dash SHALL keep runs and attempts in its own SQLite run store, separate from the
lease authority and the observation store. An attempt SHALL be in exactly one of `queued`,
`running`, `waiting_for_person`, `interrupted`, `succeeded`, `failed`, `skipped`,
`cancelled`. The coordinator SHALL admit no more active attempts than its configured cap,
SHALL retry a failed or interrupted attempt only within the class's retry budget as a new
attempt on the same claim, SHALL release the claim on a terminal failure or cancellation, and
on boot SHALL mark every `running` attempt `interrupted` before admitting anything. The walk
over a leaf SHALL take an ordered list of step nodes from WBS.

#### Scenario: The cap holds

- **WHEN** three leaves are startable and the cap is 2
- **THEN** two attempts are `running` and the third stays `queued` until one finishes

#### Scenario: A restart resumes without a second holder

- **WHEN** the coordinator is killed with one attempt `running` and started again
- **THEN** that attempt reads `interrupted`, a new attempt on the same claim is `queued`
  within budget, and WBS still shows one claim on the step

#### Scenario: A human step waits and keeps its claim

- **WHEN** the next step's class is `human`
- **THEN** the attempt reads `waiting_for_person`, the claim stays held, and `resume-attempt`
  moves it to `running`

#### Scenario: Retries exhaust into a released failure

- **WHEN** an attempt fails three times against a budget of three
- **THEN** the third reads `failed`, the claim is released, and no fourth attempt is queued

#### Scenario: Model-based lifecycle proof

- **WHEN** `fc.asyncModelRun` drives random interleavings of admit, finish, fail, kill and
  resume against the store
- **THEN** the state invariants hold in every run, and with the cap check removed the
  property fails on an over-admission
