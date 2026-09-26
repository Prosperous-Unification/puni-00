## ADDED Requirements

### Requirement: Public MCP writes require verified per-user write scope

An omitted OAuth scope SHALL remain `wbs:read`. A client that imports or changes a WBS project SHALL request and receive `wbs:write` along with read access. MCP SHALL forward the caller's per-user identity, and project authorization SHALL refuse writes to projects the caller cannot edit. A completed browser login SHALL not be treated as proof of write access. MCP access and refresh tokens SHALL expire, refresh and revoke according to their declared contract; a consumed or revoked refresh family SHALL not continue to authorize writes.

#### Scenario: Login without write is insufficient

- **GIVEN** a client that omits scope and signs in successfully
- **WHEN** it invokes a write tool
- **THEN** the write is refused for insufficient scope

#### Scenario: An owned project can be changed after refresh

- **GIVEN** an ordinary user with granted read/write scopes and an owned disposable project
- **WHEN** the access token expires and a valid refresh grant succeeds
- **THEN** a reversible write succeeds as that user and a foreign-project write is refused

#### Scenario: Revocation ends access

- **GIVEN** an active MCP refresh family
- **WHEN** it is revoked or a consumed refresh token is replayed
- **THEN** later refresh and write attempts fail
