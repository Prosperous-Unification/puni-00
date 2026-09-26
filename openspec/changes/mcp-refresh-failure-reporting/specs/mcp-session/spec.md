## ADDED Requirements

### Requirement: A tool-call refresh distinguishes refusal from failure

A tool-call session refresh SHALL reject with a session refusal when the session is missing,
expired or revoked or the provider refuses the refresh, SHALL reject with the edge-gate outcome
when the provider refresh could not be completed, and SHALL propagate any other failure
unchanged. Only a session refusal SHALL end the MCP session.

#### Scenario: refresh of an ended session

- **WHEN** a tool call refreshes a session whose family was revoked
- **THEN** the refresh rejects with a session refusal and the session ends

#### Scenario: store failure during refresh

- **WHEN** the session store throws while a tool call's refresh reads the family
- **THEN** the refresh rejects with that same failure and the session is kept
