## ADDED Requirements

### Requirement: setStatus accepts the seven settable statuses and no new kind

The `setStatus` plan command SHALL accept `status` of `unknown`, `draft`, `ready`,
`in_progress`, `on_hold`, `blocked` or `done`, with an optional `on` date, through HTTP and MCP
alike. It SHALL refuse `blocked_by_proxy` and every other value `400 invalid_status` before any
service runs. The registry SHALL keep its current count of command kinds. Its history entry
SHALL use the existing `status` kind and say what was set, such as "put X on hold" or "mark X
ready".

#### Scenario: a derived status cannot be set

- **GIVEN** a `setStatus` command whose `status` is `blocked_by_proxy`
- **WHEN** it reaches the commands route
- **THEN** it is refused `400 invalid_status` and nothing is written

#### Scenario: the kind count does not move

- **GIVEN** the plan command registry after this change
- **WHEN** its kinds are counted
- **THEN** the count equals the count before it

#### Scenario: holding done work is refused

- **GIVEN** a leaf reading `done`
- **WHEN** `setStatus` sets it `on_hold`
- **THEN** it is refused `409 cannot_hold_done` and nothing is written
