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
- **THEN** a reversible write succeeds as that user and a write to a restricted project created by another member of the grant-bound organization is refused

#### Scenario: Same-organization collaboration

- **GIVEN** a current member or admin with granted read/write scopes and another creator's unrestricted project in the grant-bound organization
- **WHEN** the user invokes a permitted write tool
- **THEN** the write succeeds under the project authorization rule

#### Scenario: Role, tenant and stewardship refusals

- **GIVEN** a viewer, a member of another organization and a member facing a restricted project created by someone else, each with granted read/write scopes
- **WHEN** each invokes a write tool
- **THEN** the viewer and restricted-project caller receive 403, and the cross-organization caller receives 404

#### Scenario: Super-admin recovery

- **GIVEN** a current super-admin with granted read/write scopes and a restricted project in the grant-bound organization
- **WHEN** they invoke a permitted write tool through the audited recovery override
- **THEN** the write succeeds and the original creator remains recorded

#### Scenario: Revocation ends access

- **GIVEN** an active MCP refresh family
- **WHEN** it is revoked or a consumed refresh token is replayed
- **THEN** later refresh and write attempts fail
