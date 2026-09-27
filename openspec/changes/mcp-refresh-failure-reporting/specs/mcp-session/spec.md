## ADDED Requirements

### Requirement: A tool-call refresh distinguishes refusal from failure

A tool-call session refresh SHALL reject with a session refusal when the session is missing,
expired or revoked or the provider refuses the refresh, SHALL reject with the edge-gate outcome
when the provider refresh is unavailable now (provider unreachable, refresh lease lost or timed
out), and SHALL propagate any other failure, such as the session store throwing, unchanged; a local defect in the provider refresh propagates the same way after its lease is released. Of
the refresh rejections, only a session refusal SHALL end the MCP session; a second be-01
credential rejection after a successful refresh still ends it.

#### Scenario: refresh of an ended session

- **WHEN** a tool call refreshes a session whose family was revoked
- **THEN** the refresh rejects with a session refusal and the session ends

#### Scenario: store failure during refresh

- **WHEN** the session store throws while a tool call's refresh reads the family
- **THEN** the refresh rejects with that same failure and the session is kept

#### Scenario: store failure while leasing the provider refresh

- **WHEN** the session store throws while a tool call's refresh takes the upstream refresh lease
- **THEN** the refresh rejects with that same failure, not the edge-gate outcome

#### Scenario: provider unreachable during refresh

- **WHEN** the provider refresh fails transiently
- **THEN** the refresh rejects with the edge-gate outcome and the session is kept

#### Scenario: local defect in the provider refresh

- **WHEN** the provider refresh fails with a failure classified as a local defect
- **THEN** the refresh rejects with that same failure, the refresh lease is released, and the next refresh calls the provider again
