## ADDED Requirements

### Requirement: A failed MCP session refresh or session end is reported once

When be-01 rejects a tool call's credential, the MCP tool-call boundary SHALL report a refresh
rejection that is neither an edge-gate outcome nor a refused session, and SHALL report a
rejected session end, each as exactly one correlated sanitized operator record, and SHALL
return the generic public sentence and reference as `isError` tool content. The failure SHALL
NOT escape as an MCP protocol error. Edge-gate outcomes and refused sessions SHALL keep their
modeled public text and SHALL NOT write an unexpected-failure record.

#### Scenario: the session store throws while the refresh looks up the family

- **GIVEN** be-01 rejects the caller's credential with 401
- **WHEN** the session refresh rejects because the session store throws
- **THEN** exactly one operator record carries that failure, with no owned secret
- **AND** the tool result is the generic sentence and its reference

#### Scenario: the session end rejects

- **GIVEN** be-01 rejects the caller's credential and the refresh is refused
- **WHEN** ending the session rejects
- **THEN** exactly one operator record carries that rejection, with no owned secret
- **AND** the tool result is the generic sentence and its reference, not a protocol error, and does not say the session ended

#### Scenario: the refresh is refused

- **GIVEN** be-01 rejects the caller's credential
- **WHEN** the refresh is refused because the session is missing, expired or revoked, or the provider refused it
- **THEN** the session ends, the result says so, and no unexpected-failure record is written
